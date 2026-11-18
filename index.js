const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  REST, 
  Routes, 
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus 
} = require('@discordjs/voice');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const ms = require('ms');
// ==================== الإعدادات الأساسية ====================
const TOKEN = process.env.TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; // أو جعله عبر متغير بيئي أيضاً
// ============================================================
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ================= نظام القضايا والسجلات الإدارية =================
const casesFile = './cases.json';
function getCasesData() {
  if (!fs.existsSync(casesFile)) {
    fs.writeFileSync(casesFile, JSON.stringify({ lastCase: 0, cases: {}, warnings: {} }, null, 2));
  }
  try { return JSON.parse(fs.readFileSync(casesFile, 'utf8')); } catch { return { lastCase: 0, cases: {}, warnings: {} }; }
}
function saveCasesData(data) {
  fs.writeFileSync(casesFile, JSON.stringify(data, null, 2));
}

// دالة موحدة لتصميم بطاقات السجلات بدقة مطابقة للصورة تماماً
async function logAction({ guild, targetUser = null, moderator, actionTitle, emoji, color, reason, duration = null, extraField = null }) {
  const db = getCasesData();
  db.lastCase += 1;
  const caseNumber = db.lastCase;

  let dmStatus = 'غير متاح / لا ينطبق';
  if (targetUser && !targetUser.bot) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} إشعار إداري من سيرفر ${guild.name}`)
        .setDescription(
          `**الإجراء:** ${actionTitle} (قضية #${caseNumber})\n` +
          `**المشرف:** ${moderator.tag}\n` +
          (duration ? `**المدة:** ${duration}\n` : '') +
          `**السبب:** ${reason}`
        )
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
      dmStatus = 'أرسلت ✅';
    } catch {
      dmStatus = 'فشل الإرسال (الخاص مغلق) ❌';
    }
  }

  db.cases[caseNumber] = {
    caseNumber,
    action: actionTitle,
    targetId: targetUser ? targetUser.id : 'عام/قناة',
    moderatorId: moderator.id,
    reason,
    date: new Date().toISOString()
  };
  saveCasesData(db);

  let descriptionText = '';
  if (targetUser) {
    descriptionText += `**العضو:** ${targetUser} • (\`${targetUser.username}\`) • \`${targetUser.id}\`\n`;
  }
  descriptionText += `**المشرف:** ${moderator} • (\`${moderator.username}\`) • \`${moderator.id}\`\n`;
  
  if (duration) descriptionText += `**المدة:** ${duration}\n`;
  descriptionText += `**السبب:** ${reason}`;

  const modEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${actionTitle} — قضية #${caseNumber}`)
    .setDescription(descriptionText)
    .setFooter({ text: `العقوبات • سجل #${caseNumber}` })
    .setTimestamp();

  if (targetUser && !targetUser.bot) {
    modEmbed.addFields({ name: 'رسالة خاصة', value: dmStatus, inline: false });
    modEmbed.setAuthor({ name: `${targetUser.displayName} (@${targetUser.username})`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) });
  }

  if (extraField) {
    modEmbed.addFields(extraField);
  }

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) {
    await logChannel.send({ embeds: [modEmbed] }).catch(() => {});
  }

  return modEmbed;
}

// متغيرات الصوت
let voiceConnection = null;
const audioPlayer = createAudioPlayer();
let currentVoice = 'ar-SA-HamedNeural';

async function speakInVoice(text) {
  if (!voiceConnection) return;
  try {
    const cleanText = text.replace(/[*#_`~]/g, '').trim();
    if (!cleanText) return;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(currentVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(cleanText);
    const resource = createAudioResource(audioStream);
    audioPlayer.play(resource);
    voiceConnection.subscribe(audioPlayer);
    await new Promise((resolve) => { audioPlayer.once(AudioPlayerStatus.Idle, resolve); });
  } catch (err) {
    console.error('❌ خطأ في الصوت:', err);
  }
}

async function getAIResponse(promptText) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
    });
    return response.text || "عذراً، لم أتمكن من صياغة إجابة.";
  } catch (error) {
    console.error('❌ خطأ AI:', error);
    return null;
  }
}

// تعريف جميع الأوامر //
const commands = [
    // الصوت والذكاء الاصطناعي //
    new SlashCommandBuilder().setName('join').setDescription('دخول الروم الصوتي'),
    new SlashCommandBuilder().setName('leave').setDescription('خروج من الروم الصوتي'),
    new SlashCommandBuilder().setName('voice').setDescription('تغيير صوت وبصمة البوت').addStringOption(o => o.setName('type').setDescription('اختر الصوت').setRequired(true)
        .addChoices(
            { name: 'SA (سعودي - رجل) - حامد', value: 'ar-SA-HamedNeural' },
            { name: 'SA (سعودي - امرأة) - زارية', value: 'ar-SA-ZariyahNeural' },
            { name: 'EG (مصري - رجل) - شاكر', value: 'ar-EG-ShakirNeural' },
            { name: 'EG (مصري - امرأة) - سلمى', value: 'ar-EG-SalmaNeural' }
        )
    ),
    new SlashCommandBuilder().setName('ask').setDescription('سؤال الذكاء الاصطناعي').addStringOption(o => o.setName('question').setDescription('السؤال').setRequired(true)),
    new SlashCommandBuilder().setName('speak').setDescription('نطق نص في الروم').addStringOption(o => o.setName('text').setDescription('النص').setRequired(true)),
  // أوامر الإدارة الشاملة والدقيقة
  new SlashCommandBuilder().setName('warn').setDescription('تحذير عضو').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('إسكات عضو').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('duration').setDescription('المدة (10m, 1h)').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('untimeout').setDescription('رفع الإسكات').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('unban').setDescription('فك الحظر').addStringOption(o => o.setName('userid').setDescription('آيدي العضو').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('lock').setDescription('قفل القناة الحالية').addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('فتح القناة الحالية').addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('clear').setDescription('مسح الرسائل').addIntegerOption(o => o.setName('amount').setDescription('العدد (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('say').setDescription('إرسال رسالة رسمية باسم البوت').addStringOption(o => o.setName('message').setDescription('النص').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('avatar').setDescription('عرض صورة البروفايل').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(false)),
  new SlashCommandBuilder().setName('case').setDescription('الاستعلام عن قضية').addIntegerOption(o => o.setName('number').setDescription('رقم القضية').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warnings').setDescription('عرض التحذيرات').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('مسح التحذيرات').addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('broadcast').setDescription('إرسال رسالة خاصة جماعية').addStringOption(o => o.setName('message').setDescription('النص').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // ضع كود الـ await هنا بداخل الحدث:
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error(error);
    }
});


// الرد التلقائي بالمنشن
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.mentions.has(client.user)) {
    const prompt = message.content.replace(/<@!??\d+>/g, '').trim();
    if (!prompt) return message.reply('أهلاً بك! كيف يمكنني مساعدتك؟');
    await message.channel.sendTyping();
    const answer = await getAIResponse(prompt);
    if (!answer) return message.reply('❌ تعذر الاتصال بالذكاء الاصطناعي.');
    await message.reply(answer.slice(0, 2000));
    if (voiceConnection) await speakInVoice(answer);
  }
});

// معالجة الأوامر
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, user, options, member, channel } = interaction;
// الصوت والذكاء الاصطناعي //
if (commandName === 'join') {
    await interaction.deferReply();
    try {
        const vc = member.voice.channel;
        if (!vc) return interaction.editReply({ content: '❌ يجب أن تدخل روم صوتي أولاً!', ephemeral: true });
        voiceConnection = joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
        await interaction.editReply(`🔊 تم الدخول إلى **${vc.name}**`);
        await speakInVoice('مرحباً بالجميع');
    } catch (error) {
        console.error('Error in join command:', error);
        await interaction.editReply('❌ حدث خطأ أثناء محاولة الانضمام للروم الصوتي.');
    }
    return;
}

if (commandName === 'leave') {
    await interaction.deferReply();
    try {
        if (!voiceConnection) return interaction.editReply({ content: '⚠️ لست في أي روم صوتي', ephemeral: true });
        voiceConnection.destroy();
        voiceConnection = null;
        await interaction.editReply('👋 تم الخروج من الروم الصوتي');
    } catch (error) {
        console.error('Error in leave command:', error);
        await interaction.editReply('❌ حدث خطأ أثناء الخروج.');
    }
    return;
}

if (commandName === 'voice') {
    await interaction.deferReply();
    try {
        currentVoice = options.getString('type');
        await interaction.editReply('🎙️ تم تغيير صوت البوت بنجاح');
        if (voiceConnection) await speakInVoice('تم تغيير صوتي بنجاح');
    } catch (error) {
        console.error('Error in voice command:', error);
        await interaction.editReply('❌ حدث خطأ أثناء تغيير الصوت.');
    }
    return;
}

if (commandName === 'speak') {
    await interaction.deferReply();
    try {
        const textToSpeak = options.getString('text');
        await interaction.editReply(`🗣️ جاري نطق النص: "${textToSpeak}"`);
        if (voiceConnection) {
            await speakInVoice(textToSpeak);
        } else {
            await interaction.editReply('⚠️ البوت ليس في أي روم صوتي حالياً!');
        }
    } catch (error) {
        console.error('Error in speak command:', error);
        await interaction.editReply('❌ حدث خطأ أثناء محاولة النطق.');
    }
    return;
}

if (commandName === 'ask') {
    await interaction.deferReply();
    try {
        const q = options.getString('question');
        const ans = await getAIResponse(q);
        const embed = new EmbedBuilder().setColor('Purple').setTitle('🤖 إجابة الذكاء الاصطناعي').addFields({ name: 'السؤال', value: q }, { name: 'الإجابة', value: ans });
        await interaction.editReply({ embeds: [embed] });
        if (voiceConnection) await speakInVoice(ans);
    } catch (error) {
        console.error('Error in ask command:', error);
        await interaction.editReply('❌ حدث خطأ أثناء معالجة السؤال.');
    }
    return;
}
  // --- أوامر الإدارة والقضايا ---
  if (commandName === 'warn') {
    const target = options.getUser('member');
    const reason = options.getString('reason') || 'لا يوجد';
    await interaction.deferReply();
    const embed = await logAction({ guild, targetUser: target, moderator: user, actionTitle: 'تحذير', emoji: '⚠️', color: '#F1C40F', reason });
    const db = getCasesData();
    if (!db.warnings[guild.id]) db.warnings[guild.id] = {};
    if (!db.warnings[guild.id][target.id]) db.warnings[guild.id][target.id] = [];
    db.warnings[guild.id][target.id].push({ reason, moderator: user.tag, date: new Date().toLocaleDateString('ar-SA') });
    saveCasesData(db);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'timeout') {
    const targetM = options.getMember('member');
    const duration = options.getString('duration');
    const reason = options.getString('reason') || 'لا يوجد';
    const timeMs = ms(duration);
    if (!timeMs) return interaction.reply({ content: '❌ صيغة الوقت غير صحيحة.', ephemeral: true });
    await interaction.deferReply();
    await targetM.timeout(timeMs, reason);
    const embed = await logAction({ guild, targetUser: targetM.user, moderator: user, actionTitle: 'إسكات مؤقت (تايم أوت)', emoji: '⏳', color: '#E67E22', reason, duration });
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'untimeout') {
    const targetM = options.getMember('member');
    await interaction.deferReply();
    await targetM.timeout(null);
    const embed = await logAction({ guild, targetUser: targetM.user, moderator: user, actionTitle: 'رفع الإسكات', emoji: '🔊', color: '#2ECC71', reason: 'رفع العقوبة يدويًا' });
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'kick') {
    const targetM = options.getMember('member');
    const reason = options.getString('reason') || 'لا يوجد';
    await interaction.deferReply();
    const embed = await logAction({ guild, targetUser: targetM.user, moderator: user, actionTitle: 'طرد من السيرفر', emoji: '👢', color: '#E74C3C', reason });
    await targetM.kick(reason);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'ban') {
    const target = options.getUser('member');
    const reason = options.getString('reason') || 'لا يوجد';
    await interaction.deferReply();
    const embed = await logAction({ guild, targetUser: target, moderator: user, actionTitle: 'حظر نهائي (باند)', emoji: '🔨', color: '#992D22', reason });
    await guild.members.ban(target.id, { reason });
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'unban') {
    const userId = options.getString('userid');
    await interaction.deferReply();
    const unbanned = await guild.members.unban(userId);
    const embed = await logAction({ guild, targetUser: unbanned, moderator: user, actionTitle: 'فك الحظر', emoji: '🔓', color: '#2ECC71', reason: 'فك الحظر عن العضو' });
    return interaction.editReply({ embeds: [embed] });
  }

  // قفل القناة
  if (commandName === 'lock') {
    const reason = options.getString('reason') || 'لا يوجد';
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
    await interaction.deferReply();
    const embed = await logAction({ guild, targetUser: null, moderator: user, actionTitle: 'قفل قناة', emoji: '🔒', color: '#E74C3C', reason, extraField: { name: 'القناة المستهدفة', value: `${channel} (\`${channel.name}\`)`, inline: false } });
    return interaction.editReply({ embeds: [embed] });
  }

  // فتح القناة
  if (commandName === 'unlock') {
    const reason = options.getString('reason') || 'لا يوجد';
    await channel.permissionOverwrites.edit(guild.id, { SendMessages: true });
    await interaction.deferReply();
    const embed = await logAction({ guild, targetUser: null, moderator: user, actionTitle: 'فتح قناة', emoji: '🔓', color: '#2ECC71', reason, extraField: { name: 'القناة المستهدفة', value: `${channel} (\`${channel.name}\`)`, inline: false } });
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    const deleted = await channel.bulkDelete(amount, true);
    return interaction.reply({ content: `🧹 تم مسح **${deleted.size}** رسالة بنجاح.`, ephemeral: true });
  }

  if (commandName === 'say') {
    const msg = options.getString('message');
    await channel.send(msg);
    return interaction.reply({ content: '✅ تم إرسال الرسالة.', ephemeral: true });
  }

  if (commandName === 'avatar') {
    const targetUser = options.getUser('member') || user;
    const embed = new EmbedBuilder().setColor('Blue').setImage(targetUser.displayAvatarURL({ size: 1024 }));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'case') {
    const num = options.getInteger('number');
    const db = getCasesData();
    const record = db.cases[num];
    if (!record) return interaction.reply({ content: `❌ لم العثور على قضية #${num}`, ephemeral: true });
    const embed = new EmbedBuilder().setColor('Blue').setTitle(`📁 تفاصيل القضية #${record.caseNumber}`).setDescription(`**النوع:** ${record.action}\n**السبب:** ${record.reason}`);
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'warnings') {
    const target = options.getUser('member');
    const db = getCasesData();
    const list = db.warnings[guild.id]?.[target.id] || [];
    if (list.length === 0) return interaction.reply('✅ سجل العضو نظيف.');
    const text = list.map((w, i) => `**${i+1}.** ${w.reason} *(بواسطة: ${w.moderator})*`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setTitle('سجل التحذيرات').setDescription(text)] });
  }

  if (commandName === 'clearwarnings') {
    const target = options.getUser('member');
    const db = getCasesData();
    if (db.warnings[guild.id]?.[target.id]) {
      delete db.warnings[guild.id][target.id];
      saveCasesData(db);
      return interaction.reply('🗑️ تم مسح التحذيرات ');
    }
    return interaction.reply({ content: '⚠️ لا توجد تحذيرات مسجلة.', ephemeral: true });
  }

  if (commandName === 'broadcast') {
    // 1. التأكد من الصلاحيات مع الانتظار
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر للمشرفين فقط', ephemeral: true });
    }

    // 2. استخدام deferReply لأن العملية تأخذ وقتاً طويلاً
    await interaction.deferReply({ ephemeral: true });

    const msgText = options.getString('message');
    await guild.members.fetch();
    const members = guild.members.cache.filter(m => !m.user.bot);
    
    let count = 0;
    for (const [id, m] of members) {
        try {
            await m.send(`📢 **إشعار عام:**\n${msgText}`);
            count++;
            await new Promise(r => setTimeout(r, 1500)); // فاصل لتجنب حظر ديسكورد
        } catch (err) {
            // تخطي الأعضاء الذين يغلقون رسائل الخاص
        }
    }

    // 3. استخدام editReply في النهاية لأنه تم استخدام deferReply في البداية
    return interaction.editReply({ content: `✅ تم الإرسال إلى **${count}** عضو بنجاح.` });
    }
});

client.once('ready', () => {
    console.log(`Logged in successfully as: ${client.user.tag}`);
});
console.log("Attempting to connect to Discord with token...");
client.login(TOKEN).catch(error => {
    console.error("Failed to login:", error);
});
client.login(TOKEN).catch(error => {
    console.error("Failed to login:", error);
});

const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(process.env.PORT || 3000);