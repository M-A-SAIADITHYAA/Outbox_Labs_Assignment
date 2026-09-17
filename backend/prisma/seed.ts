import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial database state...');

  // Seed default user matching Figma UI
  const user = await prisma.user.upsert({
    where: { email: 'oliver.brown@domain.io' },
    update: {},
    create: {
      id: 'default-user-oliver-brown',
      googleId: 'google-mock-oliver-brown',
      email: 'oliver.brown@domain.io',
      name: 'Oliver Brown',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    },
  });

  // Seed default sender identity
  const sender = await prisma.senderIdentity.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: 'oliver.brown@domain.io',
      },
    },
    update: {},
    create: {
      userId: user.id,
      email: 'oliver.brown@domain.io',
      name: 'Oliver Brown',
      hourlyLimit: 200,
      minDelayMs: 2000,
      isDefault: true,
    },
  });

  // Seed a secondary sender identity to verify multi-sender support
  await prisma.senderIdentity.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: 'sales@reachinbox-demo.com',
      },
    },
    update: {},
    create: {
      userId: user.id,
      email: 'sales@reachinbox-demo.com',
      name: 'ReachInbox Sales Team',
      hourlyLimit: 100,
      minDelayMs: 3000,
      isDefault: false,
    },
  });

  console.log('Database seeded successfully:');
  console.log(`- User: ${user.name} (${user.email})`);
  console.log(`- Senders configured: ${sender.email}, sales@reachinbox-demo.com`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
