import express, { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const app = express()
app.use(express.json())
const prisma = new PrismaClient()
app.get('/', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/identify', async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body

  const phone = phoneNumber ? String(phoneNumber) : null

  // 1. Find all contacts matching email OR phone
  const whereConditions = []
  if (email) whereConditions.push({ email })
  if (phone) whereConditions.push({ phoneNumber: phone })

  const matches = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: whereConditions,
    },
  })

  // 2. No match → create new primary contact
  if (matches.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email: email || null,
        phoneNumber: phone,
        linkPrecedence: 'primary',
      },
    })
    return res.json({
      contact: {
        primaryContatctId: newContact.id,
        emails: newContact.email ? [newContact.email] : [],
        phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
        secondaryContactIds: [],
      },
    })
  }

  // 3. Find the oldest primary contact
  const allIds = matches.map(c => c.id)
  const allLinkedIds = matches.map(c => c.linkedId).filter(Boolean) as number[]

  const allRelated = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: [...allIds, ...allLinkedIds] } },
        { linkedId: { in: [...allIds, ...allLinkedIds] } },
      ],
    },
  })

  const primaries = allRelated.filter(c => c.linkPrecedence === 'primary')
  const sortedPrimaries = primaries.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )
  const primaryContact = sortedPrimaries[0]

  // 4. Demote any newer primaries to secondary
  for (const p of sortedPrimaries.slice(1)) {
    await prisma.contact.update({
      where: { id: p.id },
      data: {
        linkPrecedence: 'secondary',
        linkedId: primaryContact.id,
        updatedAt: new Date(),
      },
    })
  }

  // 5. Get all contacts in this cluster
  const allContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
    },
    orderBy: { createdAt: 'asc' },
  })

  // 6. Check if incoming info is new → create secondary
  const allEmails = new Set(allContacts.map(c => c.email).filter(Boolean))
  const allPhones = new Set(allContacts.map(c => c.phoneNumber).filter(Boolean))

  const isNewEmail = email && !allEmails.has(email)
  const isNewPhone = phone && !allPhones.has(phone)

  if (isNewEmail || isNewPhone) {
    await prisma.contact.create({
      data: {
        email: email || null,
        phoneNumber: phone,
        linkedId: primaryContact.id,
        linkPrecedence: 'secondary',
      },
    })
  }

  // 7. Re-fetch and build response
  const finalContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
    },
    orderBy: { createdAt: 'asc' },
  })

  const primary = finalContacts.find(c => c.linkPrecedence === 'primary')!
  const secondaries = finalContacts.filter(c => c.linkPrecedence === 'secondary')

  const emails = [
    primary.email,
    ...secondaries.map(c => c.email),
  ].filter(Boolean) as string[]

  const phones = [
    primary.phoneNumber,
    ...secondaries.map(c => c.phoneNumber),
  ].filter(Boolean) as string[]

  return res.json({
    contact: {
      primaryContatctId: primary.id,
      emails: [...new Set(emails)],
      phoneNumbers: [...new Set(phones)],
      secondaryContactIds: secondaries.map(c => c.id),
    },
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))