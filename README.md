# robfin.no

A personal website I made (mostly out of boredom) that shows a live status of my Discord account + some info about me. 99% of the code came from ChatGPT.

## 🔥 Features

- **Live Discord Integration**  
  It grabs my profile picture, name, status message, and status (online / idle / dnd / offline) directly from Discord and updates in real time. (50-500ms delay)

- **Auto Deployment**  
  Any push I make from VS Code to GitHub gets deployed to my server *within seconds*. All automatic. No dragging files around.

## ⚙️ Tech Stuff

- GitHub Actions for auto-deploy over SSH
- Custom NGINX config for domain and SSL
- Node.js backend for fetching Discord data
- Frontend made with HTML, Tailwind, and vibes

## 🧠 Why I Made This

Honestly? I was bored.  
I’d never set up anything like this before, so I figured, why not?  
99% of the code came from ChatGPT, but it still took a lot of figuring out on my part to:

- Make the bot work with Discord
- Connect everything to upodate live and work
- Set up auto-deploy and SSL
- Not break everything 12 times in the process

## ⚡ Live Website

[www.robfin.no](https://www.robfin.no)
