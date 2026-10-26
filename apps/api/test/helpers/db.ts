import { PrismaService } from '../../src/common/prisma.service.js';

export async function truncateAllTables(prisma: PrismaService): Promise<void> {
  try {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';
    `;

    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        try {
          await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore if table doesn't exist yet
  }
}
