# Datche Ticketing Service

A modern web-based ticketing application with issue tracking and scheduling features.

## ✨ Features

- 🎫 **Ticket Management** - Create, edit, update, and track support tickets
- 📅 **Task Scheduling** - Schedule tasks and manage your time
- 📊 **Analytics Dashboard** - Beautiful charts showing ticket statistics
- 🌙 **Dark Mode** - Toggle between light and dark themes
- ⚡ **Real-time Updates** - Powered by Supabase
- 📱 **Fully Responsive** - Works on all devices

## 🚀 Deploy to Vercel

### Quick Deploy

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Click "Deploy"

3. **Done!** Your app is live! 🎉

### Manual Upload

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Drag and drop your project folder
4. Click "Deploy"

## 📁 Project Structure

```
Datche Ticketing Service/
├── index.html          # Main HTML file
├── styles.css          # All styles and themes
├── app.js              # Application logic
├── config.js           # Supabase configuration
├── vercel.json         # Vercel deployment config
├── .gitignore          # Git ignore file
└── README.md           # This file
```

## 🔧 Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Supabase (PostgreSQL)
- **Charts**: Chart.js
- **Hosting**: Vercel
- **Database**: PostgreSQL via Supabase

## 🎨 Features in Detail

### Ticket Management
- Create tickets with client information
- Set priority levels (Low, Medium, High, Urgent)
- Track status (Open, In Progress, Resolved, Closed)
- Add categories and notes
- Set due dates with overdue alerts

### Scheduling
- Schedule tasks linked to tickets
- Set duration and time
- View today's tasks and upcoming schedule
- Mark tasks as completed or cancelled

### Dashboard
- Real-time statistics
- Beautiful charts:
  - Monthly ticket trends
  - Status distribution
  - Priority breakdown
  - Weekly activity
- Recent tickets overview
- Today's schedule at a glance

### Theme Support
- Light and dark mode toggle
- Theme preference saved locally
- Charts adapt to theme colors

## 📄 License

ISC

## 🎉 You're All Set!

Your ticketing system is ready to deploy and use!

---

**Made with ❤️ for better client support management**

## Secure sign-in setup

The app now uses Supabase Auth for email and password sign-in. Self-service sign-up is not offered in the page; create or invite team accounts from Supabase Auth.

Before deploying the login page:

1. Run the latest `supabase-auth-security.sql` in the Supabase SQL Editor. It enables row-level security for tickets, schedules, and Storage records, creates the private Storage bucket and 10-minute access-code flow, and makes the existing image buckets private.
2. In Supabase Auth settings, disable public user sign-ups and set the Site URL and allowed redirect URL to `https://dat-tickety.vercel.app`. Password reset links return to the app origin, which must be allowed. The screenshots show this setting is already in place.
3. Invite or create the team members who should be able to sign in.

Tickets, schedules, and their existing attachments use a shared-team model. Storage files and credential records are restricted to the account that created them.

### Storage

- Storage is a restricted area. A signed-in team member requests access with the email on their account, then enters a one-time code provided by the admin.
- The Storage administrator is `johnpaulcanopen@gmail.com`. This account can review requests and issue codes in the Storage page. Codes are single-use and expire after 10 minutes; a redeemed Storage session also expires after 10 minutes.
- Upload files and photos into private, per-user storage folders.
- Store account credentials in a separate vault encrypted in the browser with AES-GCM before they are sent to Supabase.
- Choose a unique vault passphrase of at least 12 characters. The passphrase is never stored; credentials cannot be recovered if it is forgotten.
- The credential vault locks when you sign out or after 15 minutes of inactivity. Storage access is also enforced by owner-specific database and object policies and ends when the 10-minute session expires.

The Storage feature requires the latest `supabase-auth-security.sql` to be run in Supabase. Access requests and codes are tied to the signed-in account; the admin shares issued codes privately with each requester. Uploaded files are private to their owner; credential contents have the additional client-side encryption layer.

The browser contains the Supabase publishable key by design. It does not grant database access by itself; the SQL policies above enforce authenticated access in Supabase.
