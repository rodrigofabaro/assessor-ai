import { prisma } from "../lib/prisma";

async function main() {
  const bad = await prisma.referenceDocument.findMany({
    where: { storagePath: { contains: "\\test\\data\\" } },
    select: { id: true, storagePath: true, storedFilename: true },
  });

  console.log("Bad rows:", bad.length);

  for (const d of bad) {
    // Just null the bad path; extract route will fallback to canonical.
    await prisma.referenceDocument.update({
      where: { id: d.id },
      data: { storagePath: null },
    });
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
