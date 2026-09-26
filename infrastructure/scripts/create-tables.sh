#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"

create_table() {
  local name="$1"; shift
  if aws dynamodb describe-table --table-name "$name" --region "$REGION" >/dev/null 2>&1; then
    echo "✓ $name already exists"
    return
  fi
  echo "→ Creating $name"
  aws dynamodb create-table --table-name "$name" --region "$REGION" "$@" >/dev/null
  aws dynamodb wait table-exists --table-name "$name" --region "$REGION"
  echo "✓ $name active"
}

# ── Users ──────────────────────────────────────────────────────
create_table independence-users \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# ── Contexts (with KeyIndex GSI) ───────────────────────────────
create_table independence-context \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
      AttributeName=contextId,AttributeType=S \
      AttributeName=key,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
      AttributeName=contextId,KeyType=RANGE \
  --global-secondary-indexes '[
    {
      "IndexName": "KeyIndex",
      "KeySchema": [
        {"AttributeName": "userId", "KeyType": "HASH"},
        {"AttributeName": "key", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST

# Enable TTL on contexts
aws dynamodb update-time-to-live \
  --table-name independence-context \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region "$REGION" >/dev/null
echo "✓ TTL enabled on independence-context"

# ── Reminders (with StatusIndex GSI) ───────────────────────────
create_table independence-reminders \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
      AttributeName=reminderId,AttributeType=S \
      AttributeName=status,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
      AttributeName=reminderId,KeyType=RANGE \
  --global-secondary-indexes '[
    {
      "IndexName": "StatusIndex",
      "KeySchema": [
        {"AttributeName": "userId", "KeyType": "HASH"},
        {"AttributeName": "status", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST

# ── Message Drafts ─────────────────────────────────────────────
create_table independence-message-drafts \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
      AttributeName=draftId,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
      AttributeName=draftId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# ── Conversations ──────────────────────────────────────────────
create_table independence-conversations \
  --attribute-definitions \
      AttributeName=userId,AttributeType=S \
      AttributeName=conversationId,AttributeType=S \
  --key-schema \
      AttributeName=userId,KeyType=HASH \
      AttributeName=conversationId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-time-to-live \
  --table-name independence-conversations \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region "$REGION" >/dev/null
echo "✓ TTL enabled on independence-conversations"

echo ""
echo "All tables ready in $REGION."