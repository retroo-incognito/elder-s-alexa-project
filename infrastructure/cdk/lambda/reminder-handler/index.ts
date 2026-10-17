import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

interface SchedulerPayload {
  userId: string;
  reminderId: string;
  title: string;
}

/**
 * Formats an ISO timestamp into human-readable form.
 * Returns e.g. "Saturday, 17 October 2026 at 2:36 PM IST".
 */
function formatHumanDate(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;

  // Format in IST. For per-user timezones, read user.timezone
  // from DynamoDB and pass it here instead.
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

export async function handler(
  event: SchedulerPayload,
): Promise<{ statusCode: number }> {
  const { userId, reminderId, title } = event;
  const now = new Date().toISOString();

  // Mark the reminder as fired (idempotent).
  await dynamo.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { userId, reminderId },
      UpdateExpression: 'SET firedAt = :f',
      ConditionExpression: 'attribute_not_exists(firedAt)',
      ExpressionAttributeValues: { ':f': now },
    }),
  );

  // Read the reminder to get the original scheduled time
  // (not the fire time — they can differ by seconds).
  const record = await dynamo.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { userId, reminderId },
    }),
  );

  const scheduledAt =
    (record.Item?.scheduledAt as string | undefined) ?? now;
  const humanDate = formatHumanDate(scheduledAt);

  await sns.send(
    new PublishCommand({
      TopicArn: process.env.TOPIC_ARN!,
      Subject: `Reminder: ${title}`,
      Message: JSON.stringify(
        {
          default: `Reminder: ${title}`,
          email:
            `Reminder: ${title}\n\n` +
            `Scheduled for: ${humanDate}\n\n` +
            `— Sent by your Everyday Independence Agent`,
        },
        null,
        2,
      ),
      MessageStructure: 'json',
    }),
  );

  return { statusCode: 200 };
}