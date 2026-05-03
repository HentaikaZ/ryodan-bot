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
const botAdminsPath = path.join(__dirname, 'botAdmins.json');
const slotBanRoleName = 'РЎР»РµРґСЏС‰РёР№ Р·Р° С€Р°С…С‚РѕР№';
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
    try {
        fs.writeFileSync(slotBansPath, JSON.stringify(bans, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save slot bans:', err);
    }
};

const loadBotAdmins = () => {
    try {
        if (!fs.existsSync(botAdminsPath)) return {};
        return JSON.parse(fs.readFileSync(botAdminsPath, 'utf8'));
    } catch (err) {
        console.error('Failed to load bot admins:', err);
        return {};
    }
};

const saveBotAdmins = (admins) => {
    try {
        fs.writeFileSync(botAdminsPath, JSON.stringify(admins, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save bot admins:', err);
    }
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
        'вќЊ Р’С‹ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅС‹ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.',
        `РџСЂРёС‡РёРЅР°: ${ban.reason}`,
        `РљС‚Рѕ Р·Р°Р±Р°РЅРёР»: <@${ban.moderatorId}>`,
        `РЎСЂРѕРє: ${ban.days} РґРЅ. (РѕСЃС‚Р°Р»РѕСЃСЊ: ${daysLeft} РґРЅ., РґРѕ <t:${expiresAt}:f>)`
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
        return 'вњ… РЎРµР№С‡Р°СЃ РЅРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№, Р·Р°Р±Р°РЅРµРЅРЅС‹С… РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.';
    }

    return activeBans.map(([userId, ban], index) => {
        const daysLeft = Math.max(1, Math.ceil((ban.expiresAt - Date.now()) / dayMs));
        const expiresAt = Math.floor(ban.expiresAt / 1000);

        return [
            `**${index + 1}. <@${userId}>**`,
            `РџСЂРёС‡РёРЅР°: ${ban.reason}`,
            `РљС‚Рѕ Р·Р°Р±Р°РЅРёР»: <@${ban.moderatorId}>`,
            `Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ: ${ban.days} РґРЅ. (РѕСЃС‚Р°Р»РѕСЃСЊ: ${daysLeft} РґРЅ., РґРѕ <t:${expiresAt}:f>)`
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

const memberIsDiscordAdmin = (member) => {
    if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (member?.permissions) {
        try {
            return (BigInt(member.permissions) & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
        } catch {
            return false;
        }
    }

    return false;
};

const userIsBotAdmin = (guildId, userId) => {
    const admins = loadBotAdmins();
    return Boolean(admins[guildId]?.includes(userId));
};

const addBotAdmin = (guildId, userId) => {
    const admins = loadBotAdmins();
    if (!admins[guildId]) admins[guildId] = [];
    if (admins[guildId].includes(userId)) return false;

    admins[guildId].push(userId);
    saveBotAdmins(admins);
    return true;
};

const removeBotAdmin = (guildId, userId) => {
    const admins = loadBotAdmins();
    if (!admins[guildId]?.includes(userId)) return false;

    admins[guildId] = admins[guildId].filter(id => id !== userId);
    if (admins[guildId].length === 0) delete admins[guildId];
    saveBotAdmins(admins);
    return true;
};

const formatBotAdminsList = (guildId) => {
    const admins = loadBotAdmins();
    const guildAdmins = admins[guildId] || [];

    if (guildAdmins.length === 0) {
        return '✅ Сейчас нет пользователей, которым выдали отдельный доступ к командам бота.';
    }

    return [
        '**Администраторы команд бота:**',
        '',
        guildAdmins.map((userId, index) => `${index + 1}. <@${userId}>`).join('\n')
    ].join('\n');
};

const memberCanUseBotCommands = (member, guild = null, userId = null) => {
    const requiredRole = guild?.roles?.cache?.find(role => role.name === slotBanRoleName);

    if (memberIsDiscordAdmin(member)) {
        return true;
    }

    if (guild?.id && userId && userIsBotAdmin(guild.id, userId)) {
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
    return `вќЊ РљРѕРјР°РЅРґС‹ Р±РѕС‚Р° РјРѕРіСѓС‚ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂС‹ СЃРµСЂРІРµСЂР°, РїРѕР»СЊР·РѕРІР°С‚РµР»Рё СЃ СЂРѕР»СЊСЋ **${slotBanRoleName}**, СЂРѕР»СЊСЋ РІС‹С€Рµ РЅРµС‘ РёР»Рё С‚Рµ, РєРѕРјСѓ РІС‹РґР°Р»Рё РґРѕСЃС‚СѓРї С‡РµСЂРµР· /setadmin.`;
};

const adminAccessDeniedMessage = () => {
    return 'вќЊ Р­С‚Сѓ РєРѕРјР°РЅРґСѓ РјРѕРіСѓС‚ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё СЃ РїСЂР°РІРѕРј **Administrator** РЅР° СЃРµСЂРІРµСЂРµ.';
};

const helpMessage = () => {
    return [
        '**РљРѕРјР°РЅРґС‹ Р±РѕС‚Р°:**',
        '',
        '`/slots [РєРѕР»-РІРѕ] [РјРїС€РєР°]` вЂ” РѕС‚РєСЂС‹С‚СЊ РїРёРє СЃР»РѕС‚РѕРІ.',
        'РџСЂРёРјРµСЂ: `/slots 5 С€Р°С…С‚Р°`',
        '',
        '`/banslot @username [РґРЅРё] [РїСЂРёС‡РёРЅР°]` вЂ” Р·Р°Р±Р°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.',
        'РџСЂРёРјРµСЂ: `/banslot @username 7 С„Р»СѓРґ`',
        '',
        '`/unban @username` вЂ” СЂР°Р·Р±Р°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.',
        'РџСЂРёРјРµСЂ: `/unban @username`',
        '',
        '`/banlist` вЂ” РїРѕРєР°Р·Р°С‚СЊ СЃРїРёСЃРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№, Р·Р°Р±Р°РЅРµРЅРЅС‹С… РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.',
        '',
        '`/setadmin @username` вЂ” РІС‹РґР°С‚СЊ РґРѕСЃС‚СѓРї Рє РєРѕРјР°РЅРґР°Рј Р±РѕС‚Р°. РўРѕР»СЊРєРѕ РґР»СЏ СЃРµСЂРІРµСЂРЅС‹С… Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ.',
        'РџСЂРёРјРµСЂ: `/setadmin @username`',
        '',
        '`/unadmin @username` вЂ” СЃРЅСЏС‚СЊ РґРѕСЃС‚СѓРї Рє РєРѕРјР°РЅРґР°Рј Р±РѕС‚Р°. РўРѕР»СЊРєРѕ РґР»СЏ СЃРµСЂРІРµСЂРЅС‹С… Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРІ.',
        'РџСЂРёРјРµСЂ: `/unadmin @username`',
        '',
        '`/admins` - показать список пользователей с отдельным доступом к командам бота.',
        '',
        '`/help` вЂ” РїРѕРєР°Р·Р°С‚СЊ СЌС‚Рѕ СЃРѕРѕР±С‰РµРЅРёРµ.'
    ].join('\n');
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
        description: 'РћС‚РєСЂС‹С‚СЊ РїРёРє СЃР»РѕС‚РѕРІ',
        options: [
            {
                name: 'count',
                description: 'РљРѕР»РёС‡РµСЃС‚РІРѕ РїРѕР±РµРґРёС‚РµР»РµР№',
                type: 4,
                required: true
            },
            {
                name: 'target',
                description: 'РќР° С‡С‚Рѕ СЃРѕР±РёСЂР°СЋС‚СЃСЏ СЃР»РѕС‚С‹',
                type: 3,
                required: true
            }
        ]
    };

    const slotBanCommand = {
        name: 'banslot',
        description: 'Р—Р°Р±Р°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ',
        options: [
            {
                name: 'user',
                description: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ, РєРѕС‚РѕСЂРѕРіРѕ РЅСѓР¶РЅРѕ Р·Р°Р±Р°РЅРёС‚СЊ',
                type: 6,
                required: true
            },
            {
                name: 'days',
                description: 'РљРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№ Р±Р°РЅР°',
                type: 4,
                required: true
            },
            {
                name: 'reason',
                description: 'РџСЂРёС‡РёРЅР° Р±Р°РЅР°',
                type: 3,
                required: true
            }
        ]
    };

    const slotBanListCommand = {
        name: 'banlist',
        description: 'РџРѕРєР°Р·Р°С‚СЊ СЃРїРёСЃРѕРє slot-Р±Р°РЅРѕРІ'
    };

    const slotUnbanCommand = {
        name: 'unban',
        description: 'Р Р°Р·Р±Р°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ',
        options: [
            {
                name: 'user',
                description: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ, РєРѕС‚РѕСЂРѕРіРѕ РЅСѓР¶РЅРѕ СЂР°Р·Р±Р°РЅРёС‚СЊ',
                type: 6,
                required: true
            }
        ]
    };

    const helpCommand = {
        name: 'help',
        description: 'РџРѕРєР°Р·Р°С‚СЊ СЃРїРёСЃРѕРє РєРѕРјР°РЅРґ Р±РѕС‚Р°'
    };

    const setAdminCommand = {
        name: 'setadmin',
        description: 'Выдать доступ к командам бота',
        options: [
            {
                name: 'user',
                description: 'Пользователь, которому нужно выдать доступ',
                type: 6,
                required: true
            }
        ]
    };

    const unadminCommand = {
        name: 'unadmin',
        description: 'Снять доступ к командам бота',
        options: [
            {
                name: 'user',
                description: 'Пользователь, у которого нужно снять доступ',
                type: 6,
                required: true
            }
        ]
    };

    const adminsCommand = {
        name: 'admins',
        description: 'Показать список админов команд бота'
    };

    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId) {
        console.info('DISCORD_CLIENT_ID not set, skipping slash-command registration.');
    } else {
        try {
            if (guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [slotsCommand, slotBanCommand, slotBanListCommand, slotUnbanCommand, helpCommand, setAdminCommand, unadminCommand, adminsCommand] });
                console.log(`Slash commands /slots, /banslot, /banlist, /unban, /help, /setadmin, /unadmin and /admins registered for guild ${guildId} (appear instantly).`);
            } else {
                await rest.put(Routes.applicationCommands(clientId), { body: [slotsCommand, slotBanCommand, slotBanListCommand, slotUnbanCommand, helpCommand, setAdminCommand, unadminCommand, adminsCommand] });
                console.log('Slash commands /slots, /banslot, /banlist, /unban, /help, /setadmin, /unadmin and /admins registered globally (may take some minutes to appear).');
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

    const setAdminMatch = message.content.trim().match(/^\/?setadmin\s+<@!?(\d+)>$/i) || message.content.trim().match(/^!setadmin\s+<@!?(\d+)>$/i);
    if (setAdminMatch) {
        if (!memberIsDiscordAdmin(message.member)) {
            await message.reply(adminAccessDeniedMessage());
            return;
        }

        const targetUserId = setAdminMatch[1];
        const added = addBotAdmin(message.guildId, targetUserId);

        if (!added) {
            await message.reply(`ℹ️ <@${targetUserId}> уже имеет доступ к командам бота.`);
            return;
        }

        await message.reply(`✅ <@${targetUserId}> получил доступ к командам бота.`);
        return;
    }

    const unadminMatch = message.content.trim().match(/^\/?unadmin\s+<@!?(\d+)>$/i) || message.content.trim().match(/^!unadmin\s+<@!?(\d+)>$/i);
    if (unadminMatch) {
        if (!memberIsDiscordAdmin(message.member)) {
            await message.reply(adminAccessDeniedMessage());
            return;
        }

        const targetUserId = unadminMatch[1];
        const removed = removeBotAdmin(message.guildId, targetUserId);

        if (!removed) {
            await message.reply(`ℹ️ <@${targetUserId}> не имел отдельного доступа к командам бота.`);
            return;
        }

        await message.reply(`✅ У <@${targetUserId}> снят доступ к командам бота.`);
        return;
    }

    if (message.content === '!ping') {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.channel.send('Pong!');
        return;
    }

    if (/^\/?help$/i.test(message.content.trim()) || /^!help$/i.test(message.content.trim())) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.reply(helpMessage());
        return;
    }

    if (/^\/?banlist$/i.test(message.content.trim()) || /^!banlist$/i.test(message.content.trim())) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.reply(formatSlotBanList(message.guildId));
        return;
    }

    if (/^\/?admins$/i.test(message.content.trim()) || /^!admins$/i.test(message.content.trim())) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        await message.reply(formatBotAdminsList(message.guildId));
        return;
    }

    const unbanMatch = message.content.trim().match(/^\/?unban\s+<@!?(\d+)>$/i) || message.content.trim().match(/^!unban\s+<@!?(\d+)>$/i);
    if (unbanMatch) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        const targetUserId = unbanMatch[1];
        const removed = removeSlotBan(message.guildId, targetUserId);

        if (!removed) {
            await message.reply(`в„№пёЏ <@${targetUserId}> РЅРµ Р±С‹Р» Р·Р°Р±Р°РЅРµРЅ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.`);
            return;
        }

        await message.reply(`вњ… <@${targetUserId}> СЂР°Р·Р±Р°РЅРµРЅ Рё СЃРЅРѕРІР° РјРѕР¶РµС‚ СѓС‡Р°СЃС‚РІРѕРІР°С‚СЊ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.`);
        return;
    }

    const banMatch = message.content.trim().match(/^\/?banslot\s+<@!?(\d+)>\s+(\d+)\s+(.+)$/i) || message.content.trim().match(/^!banslot\s+<@!?(\d+)>\s+(\d+)\s+(.+)$/i);
    if (banMatch) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        const targetUserId = banMatch[1];
        const days = parseInt(banMatch[2], 10);
        const reason = banMatch[3].trim();

        if (!days || days < 1) {
            await message.reply('вќЊ РљРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ 0. РџСЂРёРјРµСЂ: `/banslot @username 7 РїСЂРёС‡РёРЅР°`');
            return;
        }

        if (!reason) {
            await message.reply('вќЊ РЈРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ Р±Р°РЅР°. РџСЂРёРјРµСЂ: `/banslot @username 7 РїСЂРёС‡РёРЅР°`');
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

        await message.reply(`вњ… <@${targetUserId}> Р·Р°Р±Р°РЅРµРЅ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ РЅР° ${days} РґРЅ.\nРџСЂРёС‡РёРЅР°: ${reason}`);
        return;
    }

    const matchIncomplete = message.content.trim().match(/^\/?slots\s+(\d+)$/i) || message.content.trim().match(/^!slots\s+(\d+)$/i);
    if (matchIncomplete) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        if (!allowedChannels.includes(message.channelId)) {
            await message.reply('вќЊ Р­С‚Р° РєРѕРјР°РЅРґР° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІ РєР°РЅР°Р»Рµ **РїРёРєвњ¦СЃР»РѕС‚РѕРІ** Рё **shaxta**!');
            return;
        }
        await message.reply('вќЊ РЈРєР°Р¶РёС‚Рµ РЅР° РєР°РєРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ СЃРѕР±РёСЂР°СЋС‚СЃСЏ СЃР»РѕС‚С‹!\n\n**РџСЂРёРјРµСЂС‹:**\n`/slots 5 airdrop`\n`/slots 10 С€Р°С…С‚Р°`\n`/slots 3 РµР±Р»СЏ РјР°С‚РµСЂРё РјР°СЂСЃРµР»РёРєР°`');
        return;
    }
    
    const match = message.content.trim().match(/^\/?slots\s+(\d+)\s+(.+)$/i) || message.content.trim().match(/^!slots\s+(\d+)\s+(.+)$/i);
    if (match) {
        if (!memberCanUseBotCommands(message.member, message.guild, message.author.id)) {
            await message.reply(commandAccessDeniedMessage());
            return;
        }

        if (!allowedChannels.includes(message.channelId)) {
            await message.reply('вќЊ Р­С‚Р° РєРѕРјР°РЅРґР° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІ РєР°РЅР°Р»Рµ **РїРёРєвњ¦СЃР»РѕС‚РѕРІ** Рё **shaxta**!');
            return;
        }

        const count = parseInt(match[1], 10);
        const target = match[2].trim();
        
        if (!count || count < 1 || count > 20) {
            await message.reply('вќЊ РљРѕР»РёС‡РµСЃС‚РІРѕ СЃР»РѕС‚РѕРІ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 20. РџСЂРёРјРµСЂ: `!slots 10 airdrop`');
            return;
        }
        
        if (!target) {
            await message.reply('вќЊ РЈРєР°Р¶РёС‚Рµ РЅР° С‡С‚Рѕ СЃРѕР±РёСЂР°СЋС‚СЃСЏ СЃР»РѕС‚С‹. РџСЂРёРјРµСЂ: `!slots 10 airdrop`');
            return;
        }

        await message.channel.send(`@everyone Р‘Р«РЎРўР Рћ РџРРљРђР•Рњ РЎР›РћРўР« РќРђ ${target.toUpperCase()}`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const customId = `pick_slot_${Date.now()}`;
        const pickButton = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('рџЋ° РџРёРєРЅСѓС‚СЊ СЃР»РѕС‚')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(pickButton);

        const makeEmbed = (entries) => {
            const embed = new EmbedBuilder()
                .setTitle(`рџЋ° РџРёРє СЃР»РѕС‚РѕРІ РЅР° ${target}`)
                .setDescription(`РЎР»РѕС‚С‹ СЃРѕР±РёСЂР°РµС‚: ${message.author.toString()}`)
                .addFields(
                    { name: 'рџЋЇ РќР° С‡С‚Рѕ', value: `**${target}**`, inline: true },
                    { name: 'вњЁ РЈС‡Р°СЃС‚РЅРёРєРё', value: `**${entries.length}**`, inline: true },
                    { name: 'вњЁ РџРѕР±РµРґРёС‚РµР»РµР№', value: `**${count}**`, inline: true }
                )
                .setTimestamp();

            if (entries.length > 0) {
                embed.addFields({ name: 'рџЋџпёЏ РўРµРєСѓС‰РёРµ СѓС‡Р°СЃС‚РЅРёРєРё', value: entries.map((u, i) => `${i + 1}. ${u.toString()}`).join('\n') });
            } else {
                embed.addFields({ name: 'рџЋџпёЏ РўРµРєСѓС‰РёРµ СѓС‡Р°СЃС‚РЅРёРєРё', value: 'вќЊ _РїРѕРєР° РЅРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ_' });
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
                await i.reply({ content: 'вќЊ Р’С‹ СѓР¶Рµ РЅР°Р¶Р°Р»Рё РєРЅРѕРїРєСѓ Рё СѓС‡Р°СЃС‚РІСѓРµС‚Рµ.', ephemeral: true });
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
                .setLabel('рџЋ° РџРёРєРЅСѓС‚СЊ СЃР»РѕС‚')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

            const finalEmbed = makeEmbed(entries);
            if (entries.length >= count) {
                finalEmbed.setFooter({ text: `рџЏ† Р—Р°РїРѕР»РЅРµРЅРѕ вЂ” ${entries.length}/${count} вЂ” РїРѕР±РµРґРёС‚РµР»Рё РѕРїСЂРµРґРµР»РµРЅС‹` });
            } else {
                finalEmbed.setFooter({ text: `вЏ±пёЏ РўР°Р№РјР°СѓС‚ вЂ” СЃРѕР±СЂР°РЅРѕ ${entries.length}/${count}` });
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

        if (interaction.commandName === 'setadmin') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let isDiscordAdmin = memberIsDiscordAdmin(interaction.member);
            if (!isDiscordAdmin) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                isDiscordAdmin = memberIsDiscordAdmin(fetchedMember);
            }

            if (!isDiscordAdmin) {
                await interaction.reply({ content: adminAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');

            if (!targetUser) {
                await interaction.reply({ content: '❌ Не удалось найти пользователя.', flags: MessageFlags.Ephemeral });
                return;
            }

            const added = addBotAdmin(interaction.guildId, targetUser.id);

            if (!added) {
                await interaction.reply({ content: `ℹ️ ${targetUser.toString()} уже имеет доступ к командам бота.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: `✅ ${targetUser.toString()} получил доступ к командам бота.`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'unadmin') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let isDiscordAdmin = memberIsDiscordAdmin(interaction.member);
            if (!isDiscordAdmin) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                isDiscordAdmin = memberIsDiscordAdmin(fetchedMember);
            }

            if (!isDiscordAdmin) {
                await interaction.reply({ content: adminAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');

            if (!targetUser) {
                await interaction.reply({ content: '❌ Не удалось найти пользователя.', flags: MessageFlags.Ephemeral });
                return;
            }

            const removed = removeBotAdmin(interaction.guildId, targetUser.id);

            if (!removed) {
                await interaction.reply({ content: `ℹ️ ${targetUser.toString()} не имел отдельного доступа к командам бота.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: `✅ У ${targetUser.toString()} снят доступ к командам бота.`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'help') {
            let canUseBotCommand = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canUseBotCommand) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canUseBotCommand = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
            }

            if (!canUseBotCommand) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: helpMessage(), flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'admins') {
            if (!interaction.guildId) {
                await interaction.reply({ content: '❌ Эту команду можно использовать только на сервере.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canUseBotCommand = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canUseBotCommand) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canUseBotCommand = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
            }

            if (!canUseBotCommand) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: formatBotAdminsList(interaction.guildId), flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'banlist') {
            if (!interaction.guildId) {
                await interaction.reply({ content: 'вќЊ Р­С‚Сѓ РєРѕРјР°РЅРґСѓ РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ РЅР° СЃРµСЂРІРµСЂРµ.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
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
                await interaction.reply({ content: 'вќЊ Р­С‚Сѓ РєРѕРјР°РЅРґСѓ РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ РЅР° СЃРµСЂРІРµСЂРµ.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
            }

            if (!canBanSlots) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');

            if (!targetUser) {
                await interaction.reply({ content: 'вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°Р№С‚Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ СЂР°Р·Р±Р°РЅР°.', flags: MessageFlags.Ephemeral });
                return;
            }

            const removed = removeSlotBan(interaction.guildId, targetUser.id);

            if (!removed) {
                await interaction.reply({ content: `в„№пёЏ ${targetUser.toString()} РЅРµ Р±С‹Р» Р·Р°Р±Р°РЅРµРЅ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.`, flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({ content: `вњ… ${targetUser.toString()} СЂР°Р·Р±Р°РЅРµРЅ Рё СЃРЅРѕРІР° РјРѕР¶РµС‚ СѓС‡Р°СЃС‚РІРѕРІР°С‚СЊ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ.`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.commandName === 'banslot') {
            if (!interaction.guildId) {
                await interaction.reply({ content: 'вќЊ Р­С‚Сѓ РєРѕРјР°РЅРґСѓ РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ РЅР° СЃРµСЂРІРµСЂРµ.', flags: MessageFlags.Ephemeral });
                return;
            }

            let canBanSlots = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canBanSlots) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canBanSlots = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
            }

            if (!canBanSlots) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            const targetUser = interaction.options.getUser('user');
            const days = interaction.options.getInteger('days');
            const reason = interaction.options.getString('reason')?.trim();

            if (!targetUser) {
                await interaction.reply({ content: 'вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°Р№С‚Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ Р±Р°РЅР°.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (!days || days < 1) {
                await interaction.reply({ content: 'вќЊ РљРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ 0. РџСЂРёРјРµСЂ: `/banslot @username 7 РїСЂРёС‡РёРЅР°`', flags: MessageFlags.Ephemeral });
                return;
            }

            if (!reason) {
                await interaction.reply({ content: 'вќЊ РЈРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ Р±Р°РЅР°. РџСЂРёРјРµСЂ: `/banslot @username 7 РїСЂРёС‡РёРЅР°`', flags: MessageFlags.Ephemeral });
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
                content: `вњ… ${targetUser.toString()} Р·Р°Р±Р°РЅРµРЅ РѕС‚ СѓС‡Р°СЃС‚РёСЏ РІ РїРёРєРµ СЃР»РѕС‚РѕРІ РЅР° ${days} РґРЅ.\nРџСЂРёС‡РёРЅР°: ${reason}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (interaction.commandName === 'slots') {
            let canUseBotCommand = memberCanUseBotCommands(interaction.member, interaction.guild, interaction.user.id);
            if (!canUseBotCommand) {
                const fetchedMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                canUseBotCommand = memberCanUseBotCommands(fetchedMember, interaction.guild, interaction.user.id);
            }

            if (!canUseBotCommand) {
                await interaction.reply({ content: commandAccessDeniedMessage(), flags: MessageFlags.Ephemeral });
                return;
            }

            if (!allowedChannels.includes(interaction.channelId)) {
                await interaction.reply({ content: 'вќЊ Р­С‚Р° РєРѕРјР°РЅРґР° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІ РєР°РЅР°Р»Рµ **РїРёРєвњ¦СЃР»РѕС‚РѕРІ** Рё **shaxta**!', ephemeral: true });
                return;
            }

            const count = interaction.options.getInteger('count');
            const target = interaction.options.getString('target');
            
            if (!count || count < 1 || count > 20) {
                await interaction.reply({ content: 'вќЊ РљРѕР»РёС‡РµСЃС‚РІРѕ СЃР»РѕС‚РѕРІ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 20.', ephemeral: true });
                return;
            }
            
            if (!target || target.trim().length === 0) {
                await interaction.reply({ content: 'вќЊ РЈРєР°Р¶РёС‚Рµ РЅР° С‡С‚Рѕ СЃРѕР±РёСЂР°СЋС‚СЃСЏ СЃР»РѕС‚С‹ (РЅР°РїСЂРёРјРµСЂ: airdrop, С€Р°С…С‚Р°).', ephemeral: true });
                return;
            }

            await interaction.deferReply();

            const channel = await client.channels.fetch(interaction.channelId);
            await channel.send(`@everyone Р‘Р«РЎРўР Рћ РџРРљРђР•Рњ РЎР›РћРўР« РќРђ ${target.toUpperCase()}`);

            await new Promise(resolve => setTimeout(resolve, 5000));

            const customId = `pick_slot_${Date.now()}`;
            const pickButton = new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('рџЋ° РџРёРєРЅСѓС‚СЊ СЃР»РѕС‚')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(pickButton);

            const makeEmbed = (entries) => {
                const embed = new EmbedBuilder()
                    .setTitle(`рџЋ° РџРёРє СЃР»РѕС‚РѕРІ РЅР° ${target}`)
                    .setDescription(`РЎР»РѕС‚С‹ СЃРѕР±РёСЂР°РµС‚: ${interaction.user.toString()}`)
                    .addFields(
                        { name: 'рџЋЇ РќР° С‡С‚Рѕ', value: `**${target}**`, inline: true },
                        { name: 'вњЁ РЈС‡Р°СЃС‚РЅРёРєРё', value: `**${entries.length}**`, inline: true },
                        { name: 'вњЁ РџРѕР±РµРґРёС‚РµР»РµР№', value: `**${count}**`, inline: true }
                    )
                    .setTimestamp();

                if (entries.length > 0) {
                    embed.addFields({ name: 'рџЋЇ РўРµРєСѓС‰РёРµ СѓС‡Р°СЃС‚РЅРёРєРё', value: entries.map((u, i) => `${i + 1}. ${u.toString()}`).join('\n') });
                } else {
                    embed.addFields({ name: 'рџЋЇ РўРµРєСѓС‰РёРµ СѓС‡Р°СЃС‚РЅРёРєРё', value: '_РїРѕРєР° РЅРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ_' });
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
                    await i.reply({ content: 'вќЊ РўС‹ СѓР¶Рµ РїРёРєРЅСѓР» СЃР»РѕС‚!.', flags: MessageFlags.Ephemeral });
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
                    .setLabel('рџЋ° РџРёРєРЅСѓС‚СЊ СЃР»РѕС‚')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

                const finalEmbed = makeEmbed(entries);
                if (entries.length >= count) {
                    finalEmbed.setFooter({ text: `рџЏ† Р—Р°РїРѕР»РЅРµРЅРѕ вЂ” ${entries.length}/${count} вЂ” РЎР»РѕС‚С‹ РѕРїСЂРµРґРµР»РµРЅС‹` });
                } else {
                    finalEmbed.setFooter({ text: `вЏ±пёЏ РўР°Р№РјР°СѓС‚ вЂ” СЃРѕР±СЂР°РЅРѕ ${entries.length}/${count}` });
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

