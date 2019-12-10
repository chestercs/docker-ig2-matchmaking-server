# docker-ig2-matchmaking-server

Imperium Galactica 2 matchmaking server
> Istencsászár, vezesd szolgád!

## What is that?
This is a **Docker wrapper** for an **IG2 Matchmaking server hub**.

Imperium Galactica II is a strategy game from 1999.
[[Wikipedia]](https://en.wikipedia.org/wiki/Imperium_Galactica_II:_Alliances)

The old client just couldn't run in the new systems.
THQ has made a rework of the game available at [[Steam store]](https://store.steampowered.com/app/490370/Imperium_Galactica_II/).


The sad thing is, the **Official multiplayer matchmaking server is down** for a long time.
The good thing is the **developers shared the source code of the matchmaking server**, so the players can host their own matchmaking hub.

Links:
[[Official]](https://ds.thqnordic.com/imperiumgalactica/ig2_server_release_1_0.zip)
[[Google Drive]](https://drive.google.com/file/d/18NSPb7h5KbNhAsgf6vHPe-OjDZyK0vcG/view)
[[Steamcommunity]](https://steamcommunity.com/app/490370/discussions/0/1698300679762807425)


## Installation
#### Requirements
 - [[Docker engine]](https://docs.docker.com/get-docker/) 
 - Port forwarding TCP:1611 (optional for online hosting)
#### Build
```bash
docker build -t ig2-matchmaking-server .
```
#### Run
```bash
docker run \
--name IG2Server \
--restart=unless-stopped \
-p 1611:1611 \
-d ig2-matchmaking-server
```
#### Client setup
 - Download game
 - Open file as text: (Locate your own IG2 game path)
 ```
 C:\Program Files (x86)\Steam\steamapps\common\Imperium Galactica II\ig2.settings
```
 - Edit line: (to your server ip)
```
server_address=localhost
 ```
