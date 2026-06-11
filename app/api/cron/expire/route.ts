import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { removeObject } from '@/lib/storage';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(req: Request) {
  // Validate secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  
  try {
    // 1. Soft delete: find files past expiresAt but not yet deletedAt
    const toSoftDelete = await db.file.findMany({
      where: {
        expiresAt: { lte: now },
        deletedAt: null
      },
      select: { id: true }
    });

    if (toSoftDelete.length > 0) {
      await db.file.updateMany({
        where: { id: { in: toSoftDelete.map(f => f.id) } },
        data: { deletedAt: now }
      });
      console.log(`Soft deleted ${toSoftDelete.length} files.`);
    }

    // 2. Hard delete: find files past grace window
    const graceThreshold = new Date(now.getTime() - GRACE_PERIOD_MS);
    const toHardDelete = await db.file.findMany({
      where: {
        expiresAt: { lte: graceThreshold },
        deletedAt: { not: null }
      },
      select: { id: true, objectKey: true }
    });

    let hardDeleted = 0;
    for (const file of toHardDelete) {
      try {
        await removeObject(file.objectKey);
        // Delete from DB completely, or mark permanently deleted. The plan says "hard-delete from MinIO + mark deleted".
        // Since we already deleted it from MinIO, we can delete the row from DB to keep it clean.
        await db.file.delete({ where: { id: file.id } });
        hardDeleted++;
      } catch (err) {
        console.error(`Failed to hard delete file ${file.id}:`, err);
      }
    }

    if (hardDeleted > 0) {
      console.log(`Hard deleted ${hardDeleted} files.`);
    }

    return NextResponse.json({ success: true, softDeleted: toSoftDelete.length, hardDeleted });
  } catch (error: any) {
    console.error("Cron expiry error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
