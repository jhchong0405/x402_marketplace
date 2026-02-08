#!/usr/bin/env node

/**
 * Auto-updates the "Available Services" section in public/AGENT.md
 * Run this after creating/updating services
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const AGENT_MD_PATH = path.join(__dirname, '../public/AGENT.md');

async function updateAgentDocs() {
    try {
        // Fetch all active services
        const services = await prisma.service.findMany({
            where: { isActive: true },
            include: {
                provider: {
                    select: { name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Generate service listings
        let servicesSection = '';

        if (services.length === 0) {
            servicesSection = '**No services registered yet.** Be the first to [submit your API](/submit)!';
        } else {
            servicesSection = `### Currently Available (${services.length} service${services.length > 1 ? 's' : ''})\n\n`;

            services.forEach((service) => {
                const tags = service.tags ? service.tags.split(',').map(t => `\`${t.trim()}\``).join(' ') : '';
                const tokenSymbol = service.tokenAddress ? 'Token' : 'mUSDC';

                servicesSection += `#### ${service.name}\n\n`;
                servicesSection += `${service.description}\n\n`;
                servicesSection += `- **Provider:** ${service.provider.name}\n`;
                servicesSection += `- **Price:** ${service.price} ${tokenSymbol}\n`;
                servicesSection += `- **Endpoint:** \`${service.endpointUrl}\`\n`;
                if (tags) servicesSection += `- **Tags:** ${tags}\n`;
                servicesSection += `- **Service ID:** \`${service.id}\`\n\n`;
                servicesSection += `---\n\n`;
            });
        }

        // Read current AGENT.md
        let content = fs.readFileSync(AGENT_MD_PATH, 'utf8');

        // Replace content between markers
        const startMarker = '<!-- AUTO-GENERATED: Do not edit below this line -->';
        const endMarker = '<!-- END AUTO-GENERATED -->';

        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            console.error('⚠️  Could not find AUTO-GENERATED markers in AGENT.md');
            process.exit(1);
        }

        const before = content.substring(0, startIndex + startMarker.length);
        const after = content.substring(endIndex);

        const newContent = `${before}\n<!-- This section is automatically updated when new services are registered -->\n\n${servicesSection}\n${after}`;

        // Write back
        fs.writeFileSync(AGENT_MD_PATH, newContent, 'utf8');

        console.log(`✅ Updated AGENT.md with ${services.length} service(s)`);

    } catch (error) {
        console.error('❌ Error updating AGENT.md:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

updateAgentDocs();
