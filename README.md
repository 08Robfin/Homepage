# robfin.no

A personal website I made (mostly out of boredom) that shows a live status of my Discord account + some info about me. 99% of the code came from ChatGPT. Reminder before you read this Readme and get a stroke, i have no idea what im doing and i have never done this before!

## 🔥 Features

- **Live Discord Integration**  
  It grabs my profile picture, name, status message, and status (online / idle / dnd / offline) directly from Discord and updates in real time. (50-500ms delay)

- **Auto Deployment**  
  Any push I make from VS Code to GitHub gets deployed to my server *within seconds*. All automatic. No dragging files around.

  - **Auto Updating "months" counter**  
  Under the "positions" tab, there’s a live counter showing how long I’ve held each position. This counter updates automatically, so the site always stays current.

## ⚙️ Tech Stuff

- GitHub Actions for auto-deploy over SSH
- Custom NGINX config for domain and SSL
- Node.js backend for fetching Discord data

## 🧠 Why I Made This

Honestly? I was bored.  
I’d never set up anything like this before, so I figured, why not?  
99% of the code came from ChatGPT, but it still took a lot of figuring out on my part to:

- Make the bot work with Discord
- Connect everything to upodate live and work
- Set up auto-deploy and SSL
- Not break everything 12 times in the process

## 🧠 How can you use it?
If you want to you are free to use this project to figure out, learn or have fun with stuff too!
if you want to use this, most things shoulw work straight out of the box, but if you want certian features you need more setup.

- **Live Discord Tracker:**  
  Setting up the Discord tracker is straightforward. First, create a Discord application, obtain the BOT token, and ensure the bot is in at least one server you are in. For simplicity, grant the bot all intents. Next, create a file named `.env` and add the following, replacing the placeholders with your actual token and user ID:

```
DISCORD_TOKEN=<YOUR_BOT_TOKEN>
DISCORD_USER_ID=<THE_USER_ID_TO_TRACK>
```

- **Live Website Updater:**  
  This part is a bit more complex and depends on your specific setup. First, you’ll need server access and an OpenSSH deployment key (search online for easy setup guides). Then, add that as a secret (action) to your GitHub repository where you have uploaded your files. In the repository, update the configuration in `/.github/deploy.yml/` to match your environment. Here’s what you’ll need to set:

  ```
  SERVER_USER="<Your server username>"
  SERVER_HOST="<Your server IP>"
  TARGET_DIR="<The directory you want GitHub to update when you push a new release>"
  ```



## ⚡ Live Website

[www.robfin.no](https://www.robfin.no)
