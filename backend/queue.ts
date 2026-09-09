import { Queue, Worker, Job, DelayedError } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();
const connection = new Redis({ maxRetriesPerRequest: null });

export const emailQueue = new Queue('email-queue', { connection });

// Configure Ethereal Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendSlackAlert(userEmail: string, message: string) {
  try {
    console.log('\n🔔 [SLACK] Attempting to send alert to workspace...');
    
    // FORCING THE WEBHOOK FOR THE DEMO
    const webhookUrl = "https://hooks.slack.com/services/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";
    
    if (!webhookUrl) return;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });

    if (response.ok) {
      console.log('✅ [SLACK] Alert delivered successfully!');
    } else {
      const errorText = await response.text();
      console.error(`❌ [SLACK] Slack rejected the alert. Status: ${response.status}. Error: ${errorText}`);
    }
  } catch (err) {
    console.error('❌ [SLACK] Network error while sending alert:', err);
  }
}

const worker = new Worker('email-queue', async (job: Job) => {
  const { taskId, campaignId, email, subject, body, hourlyLimit, userEmail } = job.data;
  const limit = Number(hourlyLimit);

  try {
    // 1. Redis Atomic Rate Limiting Check
    const currentHourKey = `demo_reset:rate_limit:${userEmail}:${new Date().toISOString().slice(0, 13)}`;
    const currentCount = await connection.incr(currentHourKey);
    
    if (currentCount === 1) {
      await connection.expire(currentHourKey, 3600);
    }

    // ADDED JOB ID HERE
    console.log(`▶️ [Job ${job.id}] Processing email to: ${email} | Count: ${currentCount} / Limit: ${limit}`);

    // 2. Handle Rate Limit Exceeded
    if (currentCount > limit) {
      await connection.decr(currentHourKey);
      const delayMs = 3600 * 1000;
      await job.moveToDelayed(Date.now() + delayMs, job.token || '');
      
      // ADDED JOB ID HERE
      console.log(`⏳ [Job ${job.id}] Limit exceeded for ${email}. Rescheduling & Triggering Slack alert...`);
      
      await sendSlackAlert(
        userEmail,
        `🚨 *ReachInbox Rate Limit Reached!*\nCampaign limit of *${limit} emails/hour* hit for \`${userEmail}\`. Job ID ${job.id} has been automatically rescheduled.`
      );
      
      throw new DelayedError();
    }

    // 3. Send Fake Email via Ethereal
    const info = await transporter.sendMail({
      from: `"ReachInbox (${userEmail})" <${process.env.SMTP_USER}>`,
      replyTo: userEmail,
      to: email,
      subject,
      text: body,
    });

    // ADDED JOB ID HERE
    console.log(`✅ [Job ${job.id}] [Ethereal Preview] Successfully processed ${email}: ${nodemailer.getTestMessageUrl(info)}`);

    // 4. Update Database Task Status to SENT
    await prisma.emailTask.update({
      where: { id: taskId },
      data: { status: 'SENT', sentAt: new Date() }
    });

  } catch (error: any) {
    if (error.name === 'DelayedError') {
      throw error;
    }

    console.error(`❌ [Job ${job.id}] Failed to process email task ${taskId}:`, error);
    await prisma.emailTask.update({
      where: { id: taskId },
      data: { status: 'FAILED' }
    });
    throw error;
  }
}, { connection, concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5') });

worker.on('failed', (job, err) => {
  // Prevent logging massive errors for intentional delays
  if (err.name !== 'DelayedError') {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
  }
});