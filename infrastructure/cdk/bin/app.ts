#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReminderStack } from '../lib/reminder-stack';

const app = new cdk.App();

new ReminderStack(app, 'IndependenceReminderStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});