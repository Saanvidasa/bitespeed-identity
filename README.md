# Bitespeed Identity Reconciliation

A web service that identifies and tracks customer identity across multiple purchases.

## Live Endpoint
`POST https://bitespeed-identity-w4q1.onrender.com`

## Request Format
```json
{
  "email": "example@email.com",
  "phoneNumber": "123456"
}
```

## Response Format
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["example@email.com"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

## Tech Stack
- Node.js + TypeScript
- Express.js
- PostgreSQL (Supabase)
- Prisma ORM