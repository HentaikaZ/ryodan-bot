require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, MessageFlags } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

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

    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId) {
        console.info('DISCORD_CLIENT_ID not set, skipping slash-command registration.');
    } else {
        try {
            if (guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [slotsCommand] });
                console.log(`Slash command /slots registered for guild ${guildId} (appears instantly).`);
            } else {
                await rest.put(Routes.applicationCommands(clientId), { body: [slotsCommand] });
                console.log('Slash command /slots registered globally (may take some minutes to appear).');
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
        await message.channel.send('Pong!');
        return;
    }

    const matchIncomplete = message.content.trim().match(/^\/?slots\s+(\d+)$/i) || message.content.trim().match(/^!slots\s+(\d+)$/i);
    if (matchIncomplete) {
        if (!allowedChannels.includes(message.channelId)) {
            await message.reply('❌ Эта команда доступна только в канале **пик✦слотов** и **shaxta**!');
            return;
        }
        await message.reply('❌ Укажите на какое мероприятие собираются слоты!\n\n**Примеры:**\n`/slots 5 airdrop`\n`/slots 10 шахта`\n`/slots 3 ебля матери марселика`');
        return;
    }
    
    const match = message.content.trim().match(/^\/?slots\s+(\d+)\s+(.+)$/i) || message.content.trim().match(/^!slots\s+(\d+)\s+(.+)$/i);
    if (match) {
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

        if (interaction.commandName === 'slots') {
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