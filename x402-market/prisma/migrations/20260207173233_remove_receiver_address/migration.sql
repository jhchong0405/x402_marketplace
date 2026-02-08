/*
  Warnings:

  - You are about to drop the column `receiverAddress` on the `Service` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "tokenAddress" TEXT,
    "openApiSpec" TEXT,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "providerId" TEXT NOT NULL,
    CONSTRAINT "Service_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Service" ("createdAt", "description", "endpointUrl", "id", "isActive", "name", "openApiSpec", "price", "providerId", "tags", "tokenAddress", "updatedAt") SELECT "createdAt", "description", "endpointUrl", "id", "isActive", "name", "openApiSpec", "price", "providerId", "tags", "tokenAddress", "updatedAt" FROM "Service";
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
