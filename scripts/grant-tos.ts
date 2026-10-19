import { adminAuth } from '../src/server/firebaseAdmin';

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes('@')) {
    console.error('Usage: npx tsx scripts/grant-tos.ts <email>');
    process.exit(1);
  }

  console.log(`Granting Tutorial OS (TOS) staff claim to: ${email}...`);
  try {
    const userRecord = await adminAuth.getUserByEmail(email);
    const existingClaims = userRecord.customClaims || {};
    const updatedClaims = {
      ...existingClaims,
      tos: true,
    };

    await adminAuth.setCustomUserClaims(userRecord.uid, updatedClaims);
    console.log(`✓ Successfully granted 'tos: true' claim to ${email} (UID: ${userRecord.uid})`);
    console.log(`Updated claims:`, JSON.stringify(updatedClaims, null, 2));
    console.log(`Note: The user must refresh their session or sign in again for claims to take effect.`);
  } catch (err: any) {
    console.error(`Failed to grant TOS claim:`, err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
