import { db } from '../lib/db';

async function main() {
  console.log('Setting up full-text search (searchVector) and GIN index...');

  try {
    // Add the searchVector column if it does not exist
    await db.$executeRawUnsafe(`
      ALTER TABLE "file" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
    `);
    console.log('✅ searchVector column ensured.');

    // Create the GIN index on searchVector
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "file_searchVector_idx" ON "file" USING GIN ("searchVector");
    `);
    console.log('✅ GIN index ensured.');

    console.log('Setup complete!');
  } catch (err) {
    console.error('Failed to setup FTS:', err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
