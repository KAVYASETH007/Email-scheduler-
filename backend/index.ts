import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import dotenv from 'dotenv';
import { emailQueue } from './queue';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Client } from '@elastic/elasticsearch';

// Load environment variables before anything else
dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// Initialize Elasticsearch Client using ENV variable or fallback to localhost mapping
const esClient = new Client({ node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9201' });

async function setupElasticsearch() {
  try {
    const indexName = 'emails';
    const exists = await esClient.indices.exists({ index: indexName });
    if (!exists) {
      await esClient.indices.create({ index: indexName });
      console.log('Elasticsearch "emails" index created.');
    }
  } catch (err: any) {
    console.error('Elasticsearch setup failed. Is it running locally?', err.message);
  }
}
setupElasticsearch();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: serverAdapter,
});

app.use(cors());
app.use(express.json());

app.use('/admin/queues', serverAdapter.getRouter());

app.get('/', (req, res) => {
  res.send('ReachInbox Scheduler Backend is live and running!');
});

// Slack Integration Routes
app.post('/slack/connect', async (req, res) => {
  const { userEmail, slackWebhookUrl } = req.body;

  try {
    const user = await prisma.user.update({
      where: { email: userEmail },
      data: { slackWebhookUrl }
    });
    res.json({ message: 'Slack integration connected successfully!', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to connect Slack integration' });
  }
});

app.get('/slack/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Authorization code missing' });
  }

  try {
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID || '',
        client_secret: process.env.SLACK_CLIENT_SECRET || '',
        code: code,
        redirect_uri: process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/slack/callback',
      }),
    });

    const slackData = (await tokenResponse.json()) as any;

    if (!slackData.ok) {
      console.error('Slack OAuth error:', slackData.error);
      return res.status(400).json({ error: `Slack Auth Failed: ${slackData.error}` });
    }

    const webhookUrl = slackData.incoming_webhook?.url;
    const teamName = slackData.team?.name;

    if (state && webhookUrl) {
      await prisma.user.update({
        where: { email: state as string },
        data: { slackWebhookUrl: webhookUrl }
      });
    }

    res.send(`<h3>Slack Connected Successfully for team: ${teamName}!</h3><p>You can close this window and return to the app.</p>`);
  } catch (error) {
    console.error('Failed to exchange Slack token:', error);
    res.status(500).json({ error: 'Internal server error during Slack OAuth' });
  }
});

// Campaign & Scheduler Routes
app.post('/campaigns', async (req, res) => {
  const { 
    userEmail, 
    subject, 
    body, 
    recipients, 
    scheduledStart, 
    delayBetween = 3000, 
    hourlyLimit = 50 
  } = req.body;

  try {
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail, name: 'Admin' }
    });

    const campaignStartTime = scheduledStart ? new Date(scheduledStart) : new Date();

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        subject,
        body,
        scheduledStart: campaignStartTime,
        delayBetween: Number(delayBetween),
        hourlyLimit: Number(hourlyLimit),
      }
    });

    // 1. RESPOND IMMEDIATELY TO THE FRONTEND
    res.json({ message: 'Campaign is scheduling in the background!', campaignId: campaign.id });

    // 2. PROCESS HEAVY QUEUE TASKS IN THE BACKGROUND
    setImmediate(async () => {
      try {
        let startTime = campaignStartTime.getTime();
        let currentOffset = 0;
        
        for (const recipient of recipients) {
          const taskTime = startTime + currentOffset;
          
          const task = await prisma.emailTask.create({
            data: {
              campaignId: campaign.id,
              recipientEmail: recipient,
              scheduledFor: new Date(taskTime)
            }
          });

          // Index in Elasticsearch
          try {
            await esClient.index({
              index: 'emails',
              id: task.id,
              document: {
                taskId: task.id,
                campaignId: campaign.id,
                userEmail,
                recipientEmail: recipient,
                subject,
                body,
                status: 'PENDING',
                scheduledFor: new Date(taskTime)
              }
            });
          } catch (esError: any) {
            console.error('Elasticsearch indexing skipped:', esError.message);
          }

          // Add to BullMQ with calculated delay
          const delayMs = Math.max(0, taskTime - Date.now());

          await emailQueue.add('send-email', {
            taskId: task.id,
            campaignId: campaign.id,
            email: recipient,
            subject: subject,
            body: body,
            hourlyLimit: campaign.hourlyLimit,
            userEmail: userEmail
          }, { delay: delayMs });

          // Increment the offset for the next email
          currentOffset += Number(delayBetween);
        }
      } catch (backgroundError) {
        console.error('Failed during background queueing:', backgroundError);
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process campaign' });
  }
});

app.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: { emails: true },
      orderBy: { scheduledStart: 'desc' }
    });
    res.json(campaigns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

app.get('/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const result = await esClient.search({
      index: 'emails',
      query: {
        multi_match: {
          query: q,
          fields: ['subject', 'body', 'recipientEmail']
        }
      }
    });

    const hits = result.hits.hits.map((hit: any) => hit._source);
    res.json(hits);
  } catch (error) {
    console.error('Elasticsearch search failed:', error);
    res.status(500).json({ error: 'Failed to search emails' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Dashboard is live at http://localhost:${PORT}/admin/queues`);
});