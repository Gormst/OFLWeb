# Discord Transaction Webhook

Endpoint:

```txt
POST /api/webhooks/discord/transactions
```

Required header:

```txt
X-OFL-Webhook-Secret: <OFL_WEBHOOK_SECRET>
```

`Authorization: Bearer <OFL_WEBHOOK_SECRET>` also works.

Payload:

```json
{
  "event_type": "signed",
  "player_id": "123456789",
  "player_name": "PlayerName",
  "team_name": "Brisbane Rays",
  "salary": 2500000,
  "clauses": {
    "no_trade": true
  },
  "timestamp": "2026-06-20T23:30:00Z"
}
```

Accepted `event_type` values:

```txt
signed
released
traded
```

Notes:

- `salary` can be a number or a string like `"2.5M"` or `"$750,000"`.
- `clauses` can be an object, array, or string.
- `team_name` must match an OFL team name or mascot.
- Signed and traded events move the player onto `team_name`.
- Released events remove the player from their roster.
