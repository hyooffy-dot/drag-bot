const { Client, GatewayIntentBits } = require('discord.js');

// إعداد عميل ديسكورد مع تفعيل الصلاحيات (Intents) الأساسية
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences
	]
});

const TOKEN = process.env.TOKEN;

client.once('ready', () => {
	console.log(`Logged in successfully as: ${client.user.tag}`);
});

// محاولة تسجيل الدخول مع التقاط أي خطأ مطبوع
console.log("Attempting to connect to Discord with token...");
client.login(TOKEN).catch(error => {
	console.error("Failed to login with error:", error);
});

// خادم الويب للحفاظ على تشغيل البوت على Render
const http = require('http');
http.createServer((req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('Bot is running!');
}).listen(process.env.PORT || 3000);
