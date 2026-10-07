import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

interface SchedulerPayload {
  userId: string;
  reminderId: string;
  title: string;
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

  // Publish to SNS.
  await sns.send(
    new PublishCommand({
      TopicArn: process.env.TOPIC_ARN!,
      Subject: `Reminder: ${title}`,
      Message: JSON.stringify(
        {
          default: `Reminder: ${title}`,
          email: `Reminder: ${title}\n\nScheduled for: ${now}`,
        },
        null,
        2,
      ),
      MessageStructure: 'json',
    }),
  );

  return { statusCode: 200 };
}