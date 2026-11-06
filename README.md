# Research assistant

A research assistant that runs on your own computer. You ask a question, and it searches Wikipedia, scientific papers, military doctrine, defence and general news, Reddit, LinkedIn, the web and your own documents to answer it. Every statement in an answer is numbered with the source it comes from, so you can check it.

The language models run locally through [Ollama](https://ollama.com): your questions don't go to a cloud AI service, and you don't need an account.

## Contents

- [How it works](#how-it-works)
- [The agents](#the-agents)
- [What you need](#what-you-need)
- [Getting started](#getting-started)
- [Keys](#keys)
- [Run it in Docker for your network](#run-it-in-docker-for-your-network)
- [Your documents](#your-documents)
- [Your data](#your-data)
- [Check what you find](#check-what-you-find)
- [Troubleshooting](#troubleshooting)
- [Updating](#updating)

## How it works

- **The mediator** is the main model. It reads your question, plans what it needs, and calls one agent at a time until it can answer. If a search finds little, it is told to try other words or another agent before giving up.
- **Agents** each know one kind of source. Most search it and then let a model read what they found, so the mediator gets an answer with its sources instead of a pile of results. Some search agents can open a promising page themselves.
- **Sources are numbered.** Every source an agent used gets an id, and the answer puts its number after each statement, like [1]. The code then checks each statement against the text of its source, and shows a warning when something doesn't add up.
- **The research server** runs alongside the page. It passes model requests on to Ollama, runs the searches that a browser can't do itself, and opens web pages safely as plain text.

The side menu, behind the button at the top right of the chat, has five tabs:
- **Agents:** turn agents on or off, enter keys, set their temperature.
- **Agent Conversations:** see what each agent searched, read and answered.
- **Sources:** every source used in this session, with the passages it was cited for.
- **Documents:** upload your own files.
- **Settings:** the theme and the general temperature of the models.

## The agents

| Agent | Searches | Needs |
|---|---|---|
| Wikipedia | Wikipedia articles | A free Wikimedia key |
| arXiv | Scientific papers on arXiv | Nothing; a free OpenAlex key raises the limit |
| Military doctrine | Public doctrine and defence policy | Nothing |
| Defence news | Official statements and the defence press | Nothing |
| News and social | Headlines, discussions and social media | Nothing |
| Reddit | Reddit discussions, through search engines | Nothing |
| LinkedIn | Public LinkedIn posts and events, through search engines | Nothing |
| Web search | The web | Nothing; Docker adds a second search engine |
| Read page | Opens one found page | Nothing |
| Document | Files you uploaded | Uploaded documents |
| Nominatim search and reverse geocoding | Places and coordinates | Nothing |

**Wikipedia agent.** Searches English Wikipedia through the Wikimedia API, picks the pages that fit the question and answers from the relevant sections, including tables and infoboxes. It needs a key, see [Keys](#keys).

**arXiv agent.** Finds papers on arXiv through [OpenAlex](https://openalex.org), picks the most relevant ones and answers from their text. With the embedding model installed it reads the parts of the full paper that match the question; without it, only the abstract. OpenAlex has a daily limit that everyone on your network shares unless you add a key. The settings show how many questions are left today.

**Military doctrine agent.** Searches publicly released doctrine and defence policy documents from GOV.UK, the Dutch government (overheid.nl), the Internet Archive and Crossref, and reads the newest copy it can. It says where each copy comes from, its date and its distribution statement, so you can judge and cite it. Copies labelled as uploaded are public uploads, not official versions.

**Defence news agent.** Looks for recent military and defence news. It keeps official statements (the U.S. Department of War, GOV.UK, the Dutch Ministry of Defence) apart from the defence press (Defense News, Defense One), so each can be weighed differently.

**News and social agent.** Looks for recent leads in news headlines (GDELT), online discussions (Hacker News) and social media posts (Mastodon). It shows what kind of source each lead is, because a post isn't a news report.

**Reddit agent.** Finds Reddit discussions through search engines, because Reddit no longer allows searching without approved access. It only sees short excerpts, not whole threads. It can open outside links that are mentioned in them.

**LinkedIn agent.** Finds public LinkedIn posts, articles and events about innovations and events, through search engines. LinkedIn has no public search and doesn't allow reading its pages, so this only sees what search engines show, which is patchy and often marketing.

**Web search agent.** Searches the web with DuckDuckGo and, when Docker is available, a local [SearXNG](https://docs.searxng.org/) that combines several engines. It sees titles and descriptions, and can open a few of the pages it found.

**Read page agent.** Opens a page that a search found when its description isn't enough, at most 3 per question, and at most twice per search for the search agents. The research server fetches the page and passes on only its text, so nothing on it runs and nothing is downloaded. It refuses addresses on your own network, respects each site's robots rules and doesn't open Reddit or LinkedIn.

**Document agent.** Reads the documents you uploaded in the Documents tab and answers from them, citing the page when it can. It's only available while there are documents.

**Nominatim search and reverse geocoding agents.** Look up places and their coordinates, and the place at a coordinate, in [OpenStreetMap](https://www.openstreetmap.org).

**Ask user and respond.** Always on. The mediator uses them to ask you something back, or to give its answer.

## What you need

- **[Node.js](https://nodejs.org) 22.18 or newer.**
- **[Ollama](https://ollama.com)**, which runs the language models. The two models take about 7 GB of disk space. A graphics card makes answers much faster but isn't required.
- **[Git](https://git-scm.com/downloads)**, to download the code.
- **[Docker](https://docs.docker.com/get-started/get-docker/)** (optional): adds the SearXNG search engine for better web search, and lets you run the assistant for others on your network.

It works on Linux, macOS and Windows. Running it in Docker for your network works on Linux.

## Getting started

### 1. Install Node.js

On Linux and macOS, with [nvm](https://github.com/nvm-sh/nvm):

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# Open a new terminal, then:
nvm install 24
```

On Windows, use the installer from [nodejs.org](https://nodejs.org).

Check it with `node --version`. It should show v22.18 or newer.

### 2. Install Ollama and the models

On Linux:

```sh
curl -fsSL https://ollama.com/install.sh | sh
```

On macOS and Windows, download it from [ollama.com/download](https://ollama.com/download) and start it.

Check it with `ollama --version`. Then download the models, or skip this and let `npm start` ask you later:

```sh
ollama pull qwen3.5
ollama pull nomic-embed-text
```

`qwen3.5` answers the questions. `nomic-embed-text` finds the relevant parts of long papers and documents; without it, the arXiv agent reads only abstracts.

### 3. Install Docker (optional)

On Linux:

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Then log out and back in, so you can use Docker without `sudo`.

On macOS and Windows, install [Docker Desktop](https://docs.docker.com/desktop/) and start it.

### 4. Download the code

```sh
git clone <the address of this repository>
cd research-assistant
```

### 5. Start it

```sh
npm start
```

This installs what is missing, builds the application, starts it and opens your browser at http://localhost:3001. If a model is missing, you're asked before it's downloaded. If Docker is available, the first start also downloads SearXNG.

Press Ctrl+C to stop it, along with anything it started.

Options:

| Command | What it does |
|---|---|
| `npm start -- --no-open` | Doesn't open a browser |
| `npm start -- --no-searxng` | Doesn't start SearXNG, so web search uses DuckDuckGo alone |
| `PORT=3002 npm start` | Uses another port |
| `npm run start:dev` | Reloads the page while you change the code |

### 6. Optional: add keys

The Wikipedia agent stays off until it has a key. See [Keys](#keys).

## Keys

Most agents need no key. These two can use one:

| Agent | Key | Where to get it |
|---|---|---|
| Wikipedia | Client ID and client secret, required | [Register an OAuth 2.0 app](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2) with a Wikimedia account. Choose the "Client credentials" grant. It's free. |
| arXiv | OpenAlex API key, optional | [openalex.org/settings/api](https://openalex.org/settings/api). It's free and raises the daily limit of searches. |

You can enter them in two ways:

- **In the browser:** open the side menu, then the Agents tab, then the agent. The key is stored only in that browser, and sent only to Wikimedia or OpenAlex.
- **For everyone using your computer:** put them in a `.env` file in the project folder. Everyone who uses the assistant on your computer, also from other devices, then uses your keys, and they come before keys entered in a browser.

  ```sh
  cp .env.example .env
  # Fill in the keys in .env, then restart the assistant.
  ```

  The keys stay on your computer: browsers only get short-lived Wikipedia tokens, and OpenAlex searches are relayed through the research server. Everyone shares their limits, so leave them out where people should use their own keys, such as at work.

`.env` is in `.gitignore`, so it isn't uploaded when you push the code. Never share it.

## Run it in Docker for your network

This runs the assistant in Docker on Linux, so others on your local network can use it whenever your computer is on. Ollama keeps running on your computer itself.

1. Install Docker and Ollama, as above.
2. Start it, in the project folder:

   ```sh
   docker compose up -d --build
   ```

   It starts again by itself after a restart of your computer.
3. If your firewall is on, allow your network to reach it. For example, with ufw, for a network that uses addresses starting with 192.168.1:

   ```sh
   sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp
   ```
4. Find your computer's address with `ip -4 addr`. Others then open `http://<that address>:3001`.

Everyday commands, in the project folder:

| Command | What it does |
|---|---|
| `docker compose restart` | Restarts it |
| `docker compose up -d --build` | Rebuilds and restarts it after the code or `.env` changed |
| `docker compose down` | Stops it until you start it again |
| `docker compose ps` | Shows whether it's running |
| `docker compose logs -f app` | Shows its messages |

Both this and `npm start` use port 3001. While the Docker version runs, `npm start` only opens your browser on it and starts nothing. Stop the Docker version first to use `npm start`.

Things to know:

- **What others can do:** model requests from other devices go through the assistant's server to your Ollama, which only allows using models, not downloading, changing or deleting them.
- **No login:** anyone on your network can use the assistant and your model.
- **Not encrypted:** the connection is plain HTTP.
- **Separate browsers:** conversations, documents, keys and settings stay in each person's own browser.
- **One internet connection:** all searches and opened pages come from your connection. Search engines block sooner with several users, and web, Reddit and LinkedIn search go beyond the personal use those services allow.

## Your documents

The Documents tab takes Word (`.docx`), PDF, text and Markdown files, so the model can answer questions about them and reason about them.
- **Where they go:** files are read in your browser, and their text only goes to your language model, not to the research server.
- **How long they stay:** for the session, so reloading the page clears them.
- **What can't be read:** scanned PDFs without text, old `.doc` files, and images.
- **Long documents** are read in part: the start, and what fits the question best.

## Your data

- **Questions** go to your own Ollama.
- **Searches** go to the sources themselves, directly from your browser or through the research server.
- **Keys** you enter in the agent settings are stored only in your browser.
- **Pages** that are opened see a visit from your internet address.

Web search, Reddit and LinkedIn read the result pages of search engines automatically, and some news sources only allow personal use. The research server only does this when it runs on your own computer, or when `PERSONAL_USE_FEEDS=true` is set, as the Docker setup does. Set `PERSONAL_USE_FEEDS=false` to turn them off, and read each source's terms before hosting this for others.

## Check what you find

Every source an agent used gets a number, and the answer puts that number after each statement that comes from it, like [1]. Hover a number to see the passage it is based on, or click it to open the source. The same numbers are on the source labels above the answer.

The code checks each cited statement against the text of its source, and shows a warning when:
- **Not found in source:** a statement can't be found in the source it cites.
- **Partly unsourced:** some statements have no source, so they may be the model's own reasoning or knowledge.
- **Unknown source removed:** the model cited a source that wasn't read.
- **Names an unused source:** the answer names a source, like Wikipedia, that wasn't used.
- **No verified source:** nothing in the answer could be traced back to a source.

When a model didn't quote a source exactly, the passages are matched to its answer automatically, and the source says so.

This shows where a statement came from, not that it is right. Read the passages before relying on an answer.

## Troubleshooting

**"Ollama can't be reached".** Start Ollama: open the Ollama app, or run `ollama serve`. On Linux it usually runs as a service: `systemctl status ollama`.

**Answers are slow.** The models run on your own computer, so speed depends on it. A graphics card helps a lot. The first question after a start is slower, while the model loads.

**Web search finds little.** DuckDuckGo sometimes blocks automated searches, and the assistant then waits 15 minutes before trying it again. With Docker installed, SearXNG keeps working meanwhile.

**"Port 3001 is in use".** Something else uses that port, maybe the Docker version. Stop it, or use another port: `PORT=3002 npm start`.

**"Permission denied" from Docker.** Run `sudo usermod -aG docker $USER` and log out and in again.

**The Docker version shows an old version.** Rebuild it: `docker compose up -d --build`.

**The Wikipedia agent can't be turned on.** It needs a key, see [Keys](#keys).

## Updating

```sh
git pull
npm start
```

`npm start` installs and rebuilds what changed. For the Docker version, run `docker compose up -d --build` after `git pull`.
