const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.student.createMany({
    data: [
      { name: "Test Student 1", studentRef: "TS001", email: "ts001@example.com" },
      { name: "Test Student 2", studentRef: "TS002", email: "ts002@example.com" },
    ],
    skipDuplicates: true,
  });

  await prisma.assignment.createMany({
    data: [
      { unitCode: "4017", title: "Quality Control Tools and Costing", assignmentRef: "A1" },
      { unitCode: "4017", title: "Industry Standards and Total Quality Management", assignmentRef: "A2" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete");
  console.log({
    studentCount: await prisma.student.count(),
    assignmentCount: await prisma.assignment.count(),
  });
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
