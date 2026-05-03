require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const slotBansPath = path.join(__dirname, 'slotBans.json');
const slotBanRoleName = 'Следящий за шахтой';
const dayMs = 24 * 60 * 60 * 1000;

const loadSlotBans = () => {
    try {
        if (!fs.existsSync(slotBansPath)) return {};
        return JSON.parse(fs.readFileSync(slotBansPath, 'utf8'));
    } catch (err) {
        console.error('Failed to load slot bans:', err);
        return {};
    }
};

const saveSlotBans = (bans) => {
    fs.writeFileSync(slotBansPath, JSON.stringify(bans, null, 2), 'utf8');
};

const getActiveSlotBan = (guildId, userId) => {
    const bans = loadSlotBans();
    const ban = bans[guildId]?.[userId];
    if (!ban) return null;

    if (Date.now() >= ban.expiresAt) {
        delete bans[guildId][userId];
        if (Object.keys(bans[guildId]).length === 0) delete bans[guildId];
        saveSlotBans(bans);
        return null;
    }

    return ban;
};

const formatSlotBanMessage = (ban) => {
    const daysLeft = Math.max(1, Math.ceil((ban.expiresAt - Date.now()) / dayMs));
    const expiresAt = Math.floor(ban.expiresAt / 1000);

    return [
        '❌ Вы заблокированы от участия в пике слотов.',
        `Причина: ${ban.reason}`,
        `Кто забанил: <@${ban.moderatorId}>`,
        `Срок: ${ban.days} дн. (осталось: ${daysLeft} дн., до <t:${expiresAt}:f>)`
    ].join('\n');
};

const getActiveGuildSlotBans = (guildId) => {
    const bans = loadSlotBans();
    const guildBans = bans[guildId] || {};
    const activeBans = [];
    let changed = false;

    for (const [userId, ban] of Object.entries(guildBans)) {
        if (Date.now() >= ban.expiresAt) {
            delete guildBans[userId];
            changed = true;
            continue;
        }

        activeBans.push([userId, ban]);
    }

    if (changed) {
        if (Object.keys(guildBans).length === 0) {
            delete bans[guildId];
        } else {
            bans[guildId] = guildBans;
        }
        saveSlotBans(bans);
    }

    return activeBans;
};

const formatSlotBanList = (guildId) => {
    const activeBans = getActiveGuildSlotBans(guildId);

    if (activeBans.length === 0) {
        return '✅ Сейчас нет пользователей, забаненных от участия в пике слотов.';
    }

    return activeBans.map(([userId, ban], index) => {
        const daysLeft = Math.max(1, Math.ceil((ban.expiresAt - Date.now()) / dayMs));
        const expiresAt = Math.floor(ban.expiresAt / 1000);

        return [
            `**${index + 1}. <@${userId}>**`,
            `Причина: ${ban.reason}`,
            `Кто забанил: <@${ban.moderatorId}>`,
            `Длительность: ${ban.days} дн. (осталось: ${daysLeft} дн., до <t:${expiresAt}:f>)`
        ].join('\n');
    }).join('\n\n');
};

const removeSlotBan = (guildId, userId) => {
    const bans = loadSlotBans();

    if (!bans[guildId]?.[userId]) {
        return false;
    }

    delete bans[guildId][userId];
    if (Object.keys(bans[guildId]).length === 0) delete bans[guildId];
    saveSlotBans(bans);

    return true;
};

const memberCanBanSlots = (member, guild = null) => {
    const requiredRole = guild?.roles?.cache?.find(role => role.name === slotBanRoleName);

    if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (member?.roles?.cache) {
        return member.roles.cache.some(role => role.name === slotBanRoleName || (requiredRole && role.position > requiredRole.position));
    }

    if (Array.isArray(member?.roles) && guild?.roles?.cache) {
        return member.roles.some(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role?.name === slotBanRoleName || (requiredRole && role?.position > requiredRole.position);
        });
    }

    return false;
};

const commandAccessDeniedMessage = () => {
    return `❌ Команды бота могут использовать только администраторы сервера, пользователи с ролью **${slotBanRoleName}** или ролью выше неё.`;
};

const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => res.end('ok')).listen(port, () => {
    console.log(`Keep-alive server listening on ${port}`);
});

const clientId = process.env.DISCORD_CLIENT_ID;
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

const onReady = async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const slotsCommand = {
        name: 'slots',
        description: 'Открыть раздачу слотов (первым N — выигрывают)',
        options: [
            {
                name: 'count',
                description: 'Количество победителей',
                type: 4,
                required: true
            },
            {
                name: 'target',
                description: 'На что собираются слоты (airdrop, шахта, и т.д)',
                type: 3,
                required: true
            }
        ]
    };

    const slotBanCommand = {
        name: 'ban',
        description: 'Забанить пользователя от участия в пике слотов',
        options: [
            {
                name: 'user',
                description: 'Пользователь, которого нужно забанить',
                type: 6,
                required: true
            },
            {
                name: 'days',
                description: 'Количество дней бана',
                type: 4,
                required: true
            },
            {
                name: 'reason',
                description: 'Причина бана',
                type: 3,
                required: true
            }
        ]
    };

    const slotBanListCommand = {
        name: 'banlist',
        description: 'Показать список пользователей, забаненных от участия в пике слотов'
    };

    const slotUnbanCommand = {
        name: 'unban',
        description: 'Разбанить пользователя для участия в пике слотов',
        options: [
            {
                name: 'user',
                description: 'Пользователь, которого нужно разбанить',
                type: 6,
                required: true
            }
        ]
    };

    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId) {
        console.info('DISCORD_CLIENT_ID not set, skipping slash-command registration.');
    } else {
        try {
            if (guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [slotsCommand, slotBanCommand, slotBanListCommand, slotUnbanCommand] });
                console.log(`Slash commands /slots, /ban, /banlist and /unban registered for guild ${guildId} (appear instantly).`);
            } else {
                await rest.put(Routes.applicationCommands(clientId), { body: [slotsCommand, slotBanCommand, slotBanListCommand, slotUnbanCommand] });
                console.log('Slash commands /slots, /ban, /banlist and /unban registered globally (may take some minutes to appear).');
            }
        } catch (err) {
            console.error('Failed to register slash commands:', err);
        }
    }
};

client.once('ready', onReady);

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const allowedChannels = ['1471133668813832335', '1471670121838809128'];

    if (message.content === '!ping') {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.channel.send('Pong!');
        return;
    }

    if (/^\/?banlist$/i.test(message.content.trim()) || /^!banlist$/i.test(message.content.trim())) {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.reply(formatSlotBanList(message.guildId));
        return;
    }

    const unbanMatch = message.content.trim().match(/^\/?unban\s+<@!?(\d+)>$/i) || message.content.trim().match(/^!unban\s+<@!?(\d+)>$/i);
    if (unbanMatch) {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        const targetUserId = unbanMatch[1];
        const removed = removeSlotBan(message.guildId, targetUserId);

        if (!removed) {
            await message.reply(`ℹ️ <@${targetUserId}> не был забанен от участия в пике слотов.`);
            return;
        }

        await message.reply(`✅ <@${targetUserId}> разбанен и снова может участвовать в пике слотов.`);
        return;
    }

    const banMatch = message.content.trim().match(/^\/?ban\s+<@!?(\d+)>\s+(\d+)\s+(.+)$/i) || message.content.trim().match(/^!ban\s+<@!?(\d+)>\s+(\d+)\s+(.+)$/i);
    if (banMatch) {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        const targetUserId = banMatch[1];
        const days = parseInt(banMatch[2], 10);
        const reason = banMatch[3].trim();

        if (!days || days < 1) {
            await message.reply('❌ Количество дней должно быть больше 0. Пример: `/ban @username 7 причина`');
            return;
        }

        if (!reason) {
            await message.reply('❌ Укажите причину бана. Пример: `/ban @username 7 причина`');
            return;
        }

        const bans = loadSlotBans();
        if (!bans[message.guildId]) bans[message.guildId] = {};
        bans[message.guildId][targetUserId] = {
            reason,
            days,
            moderatorId: message.author.id,
            createdAt: Date.now(),
            expiresAt: Date.now() + days * dayMs
        };
        saveSlotBans(bans);

        await message.reply(`✅ <@${targetUserId}> забанен от участия в пике слотов на ${days} дн.\nПричина: ${reason}`);
        return;
    }

    const matchIncomplete = message.content.trim().match(/^\/?slots\s+(\d+)$/i) || message.content.trim().match(/^!slots\s+(\d+)$/i);
    if (matchIncomplete) {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        if (!allowedChannels.includes(message.channelId)) {
            await message.reply('❌ Эта команда доступна только в канале **пик✦слотов** и **shaxta**!');
            return;
        }
        await message.reply('❌ Укажите на какое мероприятие собираются слоты!\n\n**Примеры:**\n`/slots 5 airdrop`\n`/slots 10 шахта`\n`/slots 3 ебля матери марселика`');
        return;
    }
    
    const match = message.content.trim().match(/^\/?slots\s+(\d+)\s+(.+)$/i) || message.content.trim().match(/^!slots\s+(\d+)\s+(.+)$/i);
    if (match) {
        if (!memberCanBanSlots(message.member, message.guild)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        if (!allowedChannels.includes(message.channelId)) {
            await message.reply('❌ Эта команда доступна только в канале **пик✦слотов** и **shaxta**!');
            return;
        }

        const count = parseInt(match[1], 10);
        const target = match[2].trim();
        
        if (!count || count < 1 || count > 20) {
            await message.reply('❌ Количество слотов должно быть от 1 до 20. Пример: `!slots 10 airdrop`');
            return;
        }
        
        if (!target) {
            await message.reply('❌ Укажите на что собираются слоты. Пример: `!slots 10 airdrop`');
            return;
        }

        await message.channel.send(`@everyone БЫСТРО ПИКАЕМ СЛОТЫ НА ${target.toUpperCase()}`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const customId = `pick_slot_${Date.now()}`;
        const pickButton = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('🎰 Пикнуть слот')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(pickButton);

        const makeEmbed = (entries) => {
            const embed = new EmbedBuilder()
                .setTitle(`🎰 Пик слотов на ${target}`)
                .setDescription(`Слоты собирает: ${message.author.toString()}`)
                .addFields(
                    { name: '🎯 На что', value: `**${target}**`, inline: true },
                    { name: '✨ Участники', value: `**${entries.length}**`, inline: true },
                    { name: '✨ Победителей', value: `**${count}**`, inline: true }
                )
                .setTimestamp();

            if (entries.length > 0) {
                embed.addFields({ name: '🎟️ Текущие участники', value: entries.map((u, i) => `${i + 1}. ${u.toString()}`).join('\n') });
            } else {
                embed.addFields({ name: '🎟️ Текущие участники', value: '❌ _пока нет участников_' });
            }

            return embed;
        };

        const initialEmbed = makeEmbed([]);
        const sent = await message.reply({ embeds: [initialEmbed], components: [row] });

        const entries = [];
        const seen = new Set();

        const filter = i => i.isButton() && i.customId === customId;
        const collector = sent.createMessageComponentCollector({ filter });

        collector.on('collect', async i => {
            const activeBan = getActiveSlotBan(i.guildId, i.user.id);
            if (activeBan) {
                await i.reply({ content: formatSlotBanMessage(activeBan), ephemeral: true });
                return;
            }

            if (seen.has(i.user.id)) {
                await i.reply({ content: '❌ Вы уже нажали кнопку и участвуете.', ephemeral: true });
                return;
            }

            seen.add(i.user.id);
            entries.push(i.user);

            const updatedEmbed = makeEmbed(entries);
            try {
                await i.update({ embeds: [updatedEmbed], components: [row] });
            } catch (err) {
                console.error('Update after collect failed:', err);
            }

            if (entries.length >= count) collector.stop('filled');
        });

        collector.on('end', async (_, reason) => {
            const disabledButton = new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('🎰 Пикнуть слот')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

            const finalEmbed = makeEmbed(entries);
            if (entries.length >= count) {
                finalEmbed.setFooter({ text: `🏆 Заполнено — ${entries.length}/${count} — победители определены` });
            } else {
                finalEmbed.setFooter({ text: `⏱️ Таймаут — собрано ${entries.length}/${count}` });
            }

            try {
                await sent.edit({ embeds: [finalEmbed], components: [disabledRow] });
            } catch (err) {
                console.error('Failed to edit message after collector end (message command):', err);
            }
        });
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const allowedChannels = ['1471133668813832335', '1471670121838809128'];

        if (interaction.commandName === 'banlist') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanBanSlots(interaction.member, interaction.guild);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanBanSlots(fetchedMember, interaction.guild);
            }

            if (!canBanSlots) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: formatSlotBanList(interaction.guildId), flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'unban') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanBanSlots(interaction.member, interaction.guild);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanBanSlots(fetchedMember, interaction.guild);
            }

            if (!canBanSlots) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');

            if (!targetUser) {
                await interaction.reply({ content: '❌ Не удалось найти пользователя для разбана.', flags: MessageFlags.Ephemeral });
                return;
            }

            const removed = removeSlotBan(interaction.guildId, targetUser.id);

            if (!removed) {
                await interaction.reply({ content: `ℹ️ ${targetUser.toString()} не был забанен от участия в пике слотов.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: `✅ ${targetUser.toString()} разбанен и снова может участвовать в пике слотов.`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'ban') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanBanSlots(interaction.member, interaction.guild);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanBanSlots(fetchedMember, interaction.guild);
            }

            if (!canBanSlots) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');
            const days = interaction.options.getInteger('days');
            const reason = interaction.options.getString('reason')?.trim();

            if (!targetUser) {
                await interaction.reply({ content: '❌ Не удалось найти пользователя для бана.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (!days || days < 1) {
                await interaction.reply({ content: '❌ Количество дней должно быть больше 0. Пример: `/ban @username 7 причина`', flags: MessageFlags.Ephemeral });
                return;
            }

            if (!reason) {
                await interaction.reply({ content: '❌ Укажите причину бана. Пример: `/ban @username 7 причина`', flags: MessageFlags.Ephemeral });
                return;
            }

            const bans = loadSlotBans();
            if (!bans[interaction.guildId]) bans[interaction.guildId] = {};
            bans[interaction.guildId][targetUser.id] = {
                reason,
                days,
                moderatorId: interaction.user.id,
                createdAt: Date.now(),
                expiresAt: Date.now() + days * dayMs
            };
            saveSlotBans(bans);

            await interaction.reply({
                content: `✅ ${targetUser.toString()} забанен от участия в пике слотов на ${days} дн.\nПричина: ${reason}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (interaction.commandName === 'slots') {
            let canUseBotCommand = memberCanBanSlots(interaction.member, interaction.guild);
            if (!canUseBotCommand) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canUseBotCommand = memberCanBanSlots(fetchedMember, interaction.guild);
            }

            if (!canUseBotCommand) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            if (!allowedChannels.includes(interaction.channelId)) {
                await interaction.reply({ content: '❌ Эта команда доступна только в канале **пик✦слотов** и **shaxta**!', ephemeral: true });
                return;
            }

            const count = interaction.options.getInteger('count');
            const target = interaction.options.getString('target');
            
            if (!count || count < 1 || count > 20) {
                await interaction.reply({ content: '❌ Количество слотов должно быть от 1 до 20.', ephemeral: true });
                return;
            }
            
            if (!target || target.trim().length === 0) {
                await interaction.reply({ content: '❌ Укажите на что собираются слоты (например: airdrop, шахта).', ephemeral: true });
                return;
            }

            await interaction.deferReply();

            const channel = await client.channels.fetch(interaction.channelId);
            await channel.send(`@everyone БЫСТРО ПИКАЕМ СЛОТЫ НА ${target.toUpperCase()}`);

            await new Promise(resolve => setTimeout(resolve, 5000));

            const customId = `pick_slot_${Date.now()}`;
            const pickButton = new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('🎰 Пикнуть слот')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(pickButton);

            const makeEmbed = (entries) => {
                const embed = new EmbedBuilder()
                    .setTitle(`🎰 Пик слотов на ${target}`)
                    .setDescription(`Слоты собирает: ${interaction.user.toString()}`)
                    .addFields(
                        { name: '🎯 На что', value: `**${target}**`, inline: true },
                        { name: '✨ Участники', value: `**${entries.length}**`, inline: true },
                        { name: '✨ Победителей', value: `**${count}**`, inline: true }
                    )
                    .setTimestamp();

                if (entries.length > 0) {
                    embed.addFields({ name: '🎯 Текущие участники', value: entries.map((u, i) => `${i + 1}. ${u.toString()}`).join('\n') });
                } else {
                    embed.addFields({ name: '🎯 Текущие участники', value: '_пока нет участников_' });
                }

                return embed;
            };

            const initialEmbed = makeEmbed([]);
            const message = await interaction.editReply({ content: null, embeds: [initialEmbed], components: [row] });

            const entries = [];
            const seen = new Set();

            const filter = i => i.isButton() && i.customId === customId;
            const collector = message.createMessageComponentCollector({ filter });

            collector.on('collect', async i => {
                const activeBan = getActiveSlotBan(i.guildId, i.user.id);
                if (activeBan) {
                    await i.reply({ content: formatSlotBanMessage(activeBan), flags: MessageFlags.Ephemeral });
                    return;
                }

                if (seen.has(i.user.id)) {
                    await i.reply({ content: '❌ Ты уже пикнул слот!.', flags: MessageFlags.Ephemeral });
                    return;
                }

                seen.add(i.user.id);
                entries.push(i.user);

                const updatedEmbed = makeEmbed(entries);
                await i.update({ embeds: [updatedEmbed], components: [row] });

                if (entries.length >= count) {
                    collector.stop('filled');
                }
            });

            collector.on('end', async (_, reason) => {
                const disabledButton = new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel('🎰 Пикнуть слот')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

                const finalEmbed = makeEmbed(entries);
                if (entries.length >= count) {
                    finalEmbed.setFooter({ text: `🏆 Заполнено — ${entries.length}/${count} — Слоты определены` });
                } else {
                    finalEmbed.setFooter({ text: `⏱️ Таймаут — собрано ${entries.length}/${count}` });
                }

                try {
                    await message.edit({ embeds: [finalEmbed], components: [disabledRow] });
                } catch (err) {
                    console.error('Failed to edit message after collector end:', err);
                }
            });
        }
    } catch (err) {
        console.error('Error handling interaction:', err);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
