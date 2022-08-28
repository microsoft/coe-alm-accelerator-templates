"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commands_1 = require("./commands/commands");
const config_1 = require("./common/config");
(async function () {
    await config_1.Config.init();
    var commands = new commands_1.CoeCliCommands(undefined);
    await commands.execute(process.argv);
})();
//# sourceMappingURL=index.js.map