"use strict";

const Eris = require("eris"),
      bot = new Eris("YOURBOTTOKENHERE", {disableEvents: {
        CHANNEL_CREATE: true,
        CHANNEL_DELETE: true,
        CHANNEL_UPDATE: true,
        GUILD_BAN_ADD: true,
        GUILD_BAN_REMOVE: true,
        GUILD_DELETE: true,
        GUILD_MEMBER_ADD: true,
        GUILD_MEMBER_REMOVE: true,
        GUILD_MEMBER_UPDATE: true,
        GUILD_ROLE_CREATE: true,
        GUILD_ROLE_DELETE: true,
        GUILD_ROLE_UPDATE: true,
        GUILD_UPDATE: true,
        MESSAGE_CREATE: false,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        MESSAGE_UPDATE: true,
        TYPING_START: true,
        VOICE_STATE_UPDATE: true
      }, restMode: true}),
      util = require("util"),
      similarity = require('string-similarity').compareTwoStrings,
      db = require("quick.db"),
      configs = new db.table("config"),
      message = new db.table("messages"),
      mute = new db.table("mute"),
      schedule = require("node-schedule").scheduleJob;

bot.on("ready", async() => {
  let mutedb = await mute.fetchAll();
  mutedb.map(g =>
    Object.keys(g.data).map(async u => {
      let config = await configs.fetch(g.ID);
      if (parseInt(g.data[u]) < Date.now()) bot.removeGuildMemberRole(g.ID, u, config.mute);
      else schedule(new Date(g.data[u].split(" ")[0]), () => {
        if (config.resetrole === true) bot.editGuildMember(g.ID, u, {roles: JSON.parse(g.data[u].split(" ")[1])}, "mute completed, undo resetrole = true*").catch(e => {})
        else bot.removeGuildMemberRole(g.ID, u, config.mute, "mute action completed*");
      });
      setTimeout(() => {
        delete g.data[u];
        mute.set(g.ID, g.data);
      }, 10000);
    })
  );
});

bot.on("messageCreate", async msg => {
  let config = await configs.fetch(msg.channel.guild.id),
      chmsgs = await message.fetch(msg.channel.id);
  if (!chmsgs) message.set(msg.channel.id, {
    memory: "",
    users: [],
    timestamp: Date.now(),
    messages: []
  });
  if (msg.content.startsWith("!config")) {
    if (!config) {
      config = {
        similarity: 0.9,
        action: null,
        delete: true,
        count: 5,
        minute: 5,
        resetrole: false,
        roles: []
      };
      configs.set(msg.channel.guild.id, config);
    }
    if (!msg.member.permission.has("manageMessages")) return msg.channel.createMessage("You need `manageMessages` to access the config.");
    else if (msg.content.split(" ").length !== 1 && msg.content.split(" ").length !== 3 && !msg.content.split(" ")[1].includes("ignore") && !msg.content.split(" ")[1].includes("mute")) return msg.channel.createMessage("Invalid format. See `!config` for help.");
    switch (msg.content.split(" ")[1]) {
      case "similarity":
        let sim = parseFloat(msg.content.split(" ")[2]);
        if (isNaN(sim) || sim > 1 || sim < 0) msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like a number between 0 and 1.");
        else {
          config.similarity = sim;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Similarity config is now adjusted to `"+sim+"`.");
        }
        break;
        case "delete":
          let del = msg.content.split(" ")[2] === "true" ? true : false;
          config.delete = del;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Delete config is now adjusted to `"+del+"`.");
          break;
      case "count":
        let cnt = parseInt(msg.content.split(" ")[2]);
        if (isNaN(cnt) || cnt < 1) msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like an integer above 1.");
        else {
          config.count = cnt;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Count config is now adjusted to `"+cnt+"`.");
        }
        break;
      case "minute":
        let mnt = parseFloat(msg.content.split(" ")[2]);
        if (isNaN(mnt)) msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like a number.");
        else {
          config.minute = mnt * 60000;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Minute config is now adjusted to "+mnt+" minutes ("+config.minute+" ms).");
        }
        break;
      case "mutetime":
        let mmt = parseFloat(msg.content.split(" ")[2]);
        if (isNaN(mmt)) msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like a number.");
        else {
          config.mutetime = mmt * 60000;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Mutetime config is now adjusted to "+mmt+" minutes ("+config.mutetime+" ms).");
        }
        break;
      case "log":
        if (msg.content.split(" ")[2] === "stop") {
          delete config.log;
          msg.channel.createMessage("Bot will no longer log actions.");
        }
        else if (msg.channelMentions.length === 1) {
          config.log = msg.channelMentions[0];
          msg.channel.createMessage("Bot will now log actions in <#"+msg.channelMentions[0]+">.");
        }
        else return msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like a channel or `stop`.");
        configs.set(msg.channel.guild.id, config);
        break;
      case "ignore":
        let role = msg.channel.guild.roles.find(r => r.name === msg.content.split(" ").slice(2).join(" "));
        if (!role) return msg.channel.createMessage("Role not found!");
        else if (config.roles && config.roles.indexOf(role.id) > -1) return msg.channel.createMessage("Role already ignored!");
        else {
          if (!config.roles) config.roles = [];
          config.roles.push(role.id);
          msg.channel.createMessage("<@&"+role.id+"> ("+role.name+") will now be ignored.");
        }
        configs.set(msg.channel.guild.id, config);
        break;
      case "mute":
        let mrole = msg.channel.guild.roles.find(r => r.name === msg.content.split(" ").slice(2).join(" "));
        if (!mrole) return msg.channel.createMessage("Role not found!");
        else {
          config.mute = mrole.id;
          msg.channel.createMessage("<@&"+mrole.id+"> ("+mrole.name+") will now be the mute role.");
        }
        configs.set(msg.channel.guild.id, config);
        break;
      case "unignore":
        let unrole = msg.channel.guild.roles.find(r => r.name === msg.content.split(" ").slice(2).join(" "));
        if (!unrole) return msg.channel.createMessage("Role not found!");
        else if (!config.roles || config.roles.indexOf(unrole.id) === -1) return msg.channel.createMessage("Role was not ignored!");
        else {
          config.roles.splice(config.roles.indexOf(unrole.id), 1);
          msg.channel.createMessage("<@&"+unrole.id+"> ("+unrole.name+") will no longer be ignored.");
        }
        configs.set(msg.channel.guild.id, config);
        break;
      case "resetrole":
        config.resetrole = true;
        configs.set(msg.channel.guild.id, config);
        msg.channel.createMessage((config.resetrole ? "Existing roles will be removed when a person is muted." : "Existing roles will NOT be removed when a person is muted.")+(config.action === "mute" ? " " : " However, the action is currently not `mute`, so this does not take effect."));
        break;
      case "action":
        let action = msg.content.split(" ")[2],
            perm = (action !== "null") ? (action !== "kick" ? ((action !== "ban:0" && action !== "ban:1" && action !== "ban:7") ? (action !== "mute" ? null : "manageRoles") : "banMembers") : "kickMembers") : "manageMessages";
        if (!perm) msg.channel.createMessage("Hmm... `"+msg.content.split(" ")[2]+"` does not seem like a valid action.");
        else if (!msg.channel.guild.members.get(bot.user.id).permission.has(perm))
          msg.channel.createMessage("I do not have `"+perm+"` in order to fulfill your action.");
        else if (!msg.member.permission.has(perm))
          msg.channel.createMessage("You do not have `"+perm+"` to let me fulfill your action.");
        else {
          config.action = action === "null" ? null : action;
          configs.set(msg.channel.guild.id, config);
          msg.channel.createMessage("Action config is now adjusted to `"+action+"`.");
        }
        break;
      default:
        msg.channel.createMessage({embed: {
          title: "Available configs",
          fields: [
            {name: "!config similarity <value>", value: "Provide a lower threshold of similarity (0 to 1, allows decimals) of five neighbouring messages for the action below to apply. Current value is `"+config.similarity+"`."},
            {name: "!config delete <true/false>", value: "Should the bot delete the duplicating messages or not? Current value is `"+config.delete+"`."},
            {name: "!config action <value>", value: "Provide the action (aside from deleting) to apply if messages are proven similar. Can be `null` (Do nothing), `kick`, `ban:0`, `ban:1` (1-day message removal), `ban:7` (7-day message removal), or `mute`. Current value is `"+config.action+"`."},
            {name: "!config count <value>", value: "How many duplicate messages do I need to take the action above? Must be an integer above 1 (Recommended: =5). Current value is `"+config.count+"`."},
            {name: "!config minute <value>", value: "How long should I listen to a set of duplicated messages so to take the action above? Must be a number of minutes (Allows floats, but please be reasonable). Current value is `"+config.minute / 60000+"`."},
            {name: "!config log <#channel>", value: "Where should I log actions? " + (!config.log ? "Bot is currently not logging." : "Current value is <#"+config.log+">.")+" (If you want the bot to stop logging, do `!config log stop`.)"},
            {name: "!config <ignore/unignore> <role name>", value: "Are there certain **roles** that the bot should ignore? " + ((!config.roles || config.roles.length === 0) ? "No roles are ignored currently." : "These roles are currently ignored: "+config.roles.map(r => "<@&"+r+">"))},
            {name: "!config mute <role name>", value: "Should the bot be muting violators, what role should it use? " + (!config.mute ? "No mute role configured." : "Current value is <@&"+config.mute+">.")+" Config only active if `action` is `mute`."},
            {name: "!config mutetime <value>", value: "How long should the bot be muting people? Must be a number of minutes (Allows floats, but please be reasonable). Current value is `"+(config.mutetime / 60000)+"`. Config only active if `action` is `mute`."},
            {name: "!config resetrole <true/false>", value: "Should the bot remove the violator's roles upon mute? Current value is `"+config.resetrole+"`. Config only active if `action` is `mute`."},
          ]
        }});
    }
  }
  else if (chmsgs && !msg.author.bot && config.roles.filter(r => msg.member.roles.indexOf(r) > -1).length === 0) {
    if (msg.content !== "" && similarity(msg.content, chmsgs.memory) >= config.similarity && chmsgs.timestamp + config.minute > Date.now()) {
      chmsgs.users.indexOf(msg.author.id) === -1 ? chmsgs.users.push(msg.author.id) : null;
      chmsgs.messages.push(msg.id);
      console.log("detected");
    }
    else {
      chmsgs.messages = [];
      chmsgs.users = [];
    }
    if (chmsgs.messages.length >= config.count) {
      if (config.log) msg.channel.getMessages(50, chmsgs.messages[config.count - 1], (parseInt(chmsgs.messages[0])-100).toString()).then(async ms => {
        bot.createMessage(config.log, {embed: {
          title: "Action taken!",
          fields: [
            {name: "Users", value: chmsgs.users.map(u => "<@"+u+">").join("\n")},
            {name: "Action", value: config.action ? config.action : "None"},
            {name: "Messages", value: ms.map(m => (ms.indexOf(m)+1).toString()+". `"+m.content+"`").join("\n")}
          ],
          footer: {text: "Remember: You can always use \"!config\" to change settings!"},
          timestamp: new Date().toISOString()
        }})
        if (config.delete) msg.channel.deleteMessages(chmsgs.messages)
          .catch(e => msg.channel.createMessage("I cannot remove messages!"));
        switch (config.action) {
          case "kick":
            chmsgs.users.map(u =>
              msg.channel.guild.kickMember(u, "5 messages reached similarity threshold of "+config.similarity)
              .catch(e => msg.channel.createMessage("I cannot kick <@"+u+">!"))
            );
            break;
          case "ban:0":
          case "ban:1":
          case "ban:7":
            chmsgs.users.map(u =>
              msg.channel.guild.banMember(u, parseInt(config.action.split(":")[1]), "5 messages reached similarity threshold of "+config.similarity)
              .catch(e => msg.channel.createMessage("I cannot ban <@"+u+">!"))
            );
            break;
          case "mute":
            let svmute = await mute.fetch(msg.channel.guild.id);
            if (!svmute) svmute = {};
            [...new Set(chmsgs.users)].map(u => {
              let rp = msg.channel.guild.members.get(u).roles
              .filter(c => msg.channel.guild.roles.get(c))
              .sort((a, b) => msg.channel.guild.roles.get(b).position - msg.channel.guild.roles.get(a).position)[0];
              if (rp && msg.channel.guild.roles.get(rp).position > msg.channel.guild.roles.get(config.mute).position) return msg.channel.createMessage("I cannot mute <@"+u+"> due to a role higher than the mute role!");
              svmute[u] = Date.now() + config.mutetime;
              let newroles = msg.channel.guild.members.get(u).roles
              svmute[u] = svmute[u].toString() + " " + JSON.stringify(newroles.filter(a => a !== config.mute));
              mute.set(msg.channel.guild.id, svmute);
              if (config.resetrole === true) msg.channel.guild.members.get(u).edit({roles: [config.mute]}, "mute applied, resetrole = true, should unmute @ "+new Date(Date.now() + config.mutetime).toString())
              else msg.channel.guild.addMemberRole(u, config.mute, "mute action applied, should unmute @ "+new Date(Date.now() + config.mutetime).toString());
              console.log("Mute data for " + u + ": " + svmute[u]);
              schedule(new Date(Date.now() + config.mutetime), () => {
                console.log("Unmute data for " + u + ": " + svmute[u]);
                if (config.resetrole === true && svmute[u]) msg.channel.guild.members.get(u).edit({roles: JSON.parse(svmute[u].split(" ")[1])}, "mute completed, undo resetrole = true").catch(e => {})
                else msg.channel.guild.removeMemberRole(u, config.mute, "mute action completed");
                setTimeout(() => {
                  delete svmute[u];
                  mute.set(msg.channel.guild.id, svmute);
                }, 10000);
              });
            });
            break;
          case null:
            break;
          default:
            msg.channel.createMessage("Action config contains unexpected value, contact bot owner immediately");
        };
        chmsgs.messages = [];
        chmsgs.users = [];
        chmsgs.memory = "";
        message.set(msg.channel.id, chmsgs);
      });
    }
    else {
      chmsgs.timestamp = Date.now();
      chmsgs.memory = msg.content === "" ? chmsgs.memory : msg.content;
      message.set(msg.channel.id, chmsgs);
      console.log("received, record:", chmsgs);
    }
  }
});

bot.connect();
