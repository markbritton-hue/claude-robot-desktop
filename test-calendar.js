const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-credentials.json'))).installed;
const token = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-token.json')));

const oAuth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
oAuth2.setCredentials(token);

const cal = google.calendar({ version: 'v3', auth: oAuth2 });

const start = new Date(Date.now() + 3 * 60 * 1000); // 3 min from now
const end   = new Date(Date.now() + 33 * 60 * 1000);

cal.events.insert({
  calendarId: 'primary',
  resource: {
    summary: 'Robot Test Event',
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
  },
}).then(res => {
  console.log(`✅ Test event created: "Robot Test Event" at ${start.toLocaleTimeString()}`);
  console.log(`   Robot should announce it within 5 minutes.`);
}).catch(err => console.error('❌ Error:', err.message));
