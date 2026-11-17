const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// تصميم الصفحة بشكل أنيق ومناسب للعرض
app.get('/', (req, res) => {
	let casesData = { cases: {}, warnings: {} };

	// قراءة ملف القضايا الخاص بالبوت تلقائياً
	if (fs.existsSync('./cases.json')) {
		try {
			casesData = JSON.parse(fs.readFileSync('./cases.json', 'utf8'));
		} catch (err) {
			console.log('خطأ في قراءة ملف القضايا');
		}
	}

	// بناء صفحة HTML مباشرة تعرض اللوقات والقضايا بجدول مرتب
	let html = `
		<!DOCTYPE html>
		<html lang="ar" dir="rtl">
		<head>
				<meta charset="UTF-8">
				<title>لوحة تحكم السيرفر - السجلات والقضايا</title>
				<style>
						body { font-family: Tahoma, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; }
						h1 { text-align: center; color: #38bdf8; }
						.container { max-width: 900px; margin: auto; background: #1e293b; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
						table { width: 100%; border-collapse: collapse; margin-top: 20px; }
						th, td { padding: 12px; text-align: right; border-bottom: 1px solid #334155; }
						th { background-color: #0284c7; color: white; }
						tr:hover { background-color: #334155; }
						.badge { background: #0369a1; padding: 5px 10px; border-radius: 6px; font-size: 14px; }
				</style>
		</head>
		<body>
				<div class="container">
						<h1>🛡️ لوحة سجلات وقضايا السيرفر</h1>
						<p>إليك كافة العمليات والقضايا المسجلة في البوت بشكل مباشر:</p>
						<table>
								<tr>
										<th>رقم القضية</th>
										<th>نوع الإجراء</th>
										<th>معرف المستهدف</th>
										<th>السبب</th>
										<th>التاريخ</th>
								</tr>
	`;

	const casesObj = casesData.cases || {};
	const caseKeys = Object.keys(casesObj);

	if (caseKeys.length === 0) {
		html += `<tr><td colspan="5" style="text-align: center;">لا توجد قضايا مسجلة حتى الآن.</td></tr>`;
	} else {
		caseKeys.forEach(key => {
			const c = casesObj[key];
			html += `
				<tr>
						<td><span class="badge">#${c.caseNumber}</span></td>
						<td><b>${c.action}</b></td>
						<td><code>${c.targetId}</code></td>
						<td>${c.reason}</td>
						<td>${new Date(c.date).toLocaleString('ar-SA')}</td>
				</tr>
			`;
		});
	}

	html += `
						</table>
				</div>
		</body>
		</html>
	`;

	res.send(html);
});

app.listen(PORT, () => {
	console.log(`🌐 تم تشغيل لوحة التحكم بنجاح! افتح المتصفح على الرابط: http://localhost:${PORT}`);
});
