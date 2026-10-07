import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class ReminderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── SNS topic for notifications ────────────────────────
    const topic = new sns.Topic(this, 'ReminderTopic', {
      topicName: 'independence-reminder-notifications',
      displayName: 'Independence Agent Reminders',
    });

    // Subscribe an email for the demo. In production, add
    // per-user subscriptions via mobile push platform endpoints.
    topic.addSubscription(
      new snsSubs.EmailSubscription('you@example.com'),
    );

    // ── Reference the existing reminders table ─────────────
    const remindersTable = dynamodb.Table.fromTableName(
      this,
      'RemindersTable',
      'independence-reminders',
    );

    // ── Lambda: fires when a schedule triggers ─────────────
    const reminderHandler = new lambda.Function(this, 'ReminderHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/reminder-handler'),
      ),
      timeout: cdk.Duration.seconds(10),
      environment: {
        TOPIC_ARN: topic.topicArn,
        TABLE_NAME: remindersTable.tableName,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // Permissions
    topic.grantPublish(reminderHandler);
    remindersTable.grantReadWriteData(reminderHandler);

    // ── IAM role for EventBridge Scheduler to invoke Lambda ─
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    reminderHandler.grantInvoke(schedulerRole);

    // Export the role ARN — the agent needs it when creating schedules.
    new cdk.CfnOutput(this, 'SchedulerRoleArn', {
      value: schedulerRole.roleArn,
      exportName: 'IndependenceSchedulerRoleArn',
    });

    new cdk.CfnOutput(this, 'ReminderTopicArn', {
      value: topic.topicArn,
      exportName: 'IndependenceReminderTopicArn',
    });

    new cdk.CfnOutput(this, 'ReminderHandlerArn', {
      value: reminderHandler.functionArn,
      exportName: 'IndependenceReminderHandlerArn',
    });
  }
}