"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunCommand = exports.RunArguments = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const commands_1 = require("./commands");
/**
 * Run commands
 */
class RunCommand {
    constructor(logger) {
        this.logger = logger;
        this.creatCoeCliCommands = () => {
            let command = new commands_1.CoeCliCommands(this.logger);
            command.logger = this.logger;
            return command;
        };
    }
    /**
     * Execute the command
     * @param args
     * @returns
     */
    async execute(args) {
        var _a, _b;
        let configFile = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
        let json = await fs.promises.readFile(args.file, 'utf8');
        let data = JSON.parse(json);
        let commands = [];
        for (let i = 0; i < data.length; i++) {
            commands.push(data[i]);
        }
        let executor = this.creatCoeCliCommands();
        for (var i = 0; i < commands.length; i++) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Running ${commands[i].name}`);
            let childArgs = [];
            childArgs.push('node');
            childArgs.push('run');
            (_b = commands[i].args) === null || _b === void 0 ? void 0 : _b.forEach(arg => childArgs.push(arg));
            await executor.execute(childArgs);
        }
    }
}
exports.RunCommand = RunCommand;
/**
 * Run Command Arguments
 */
class RunArguments {
}
exports.RunArguments = RunArguments;
/**
 * Run Command Arguments
 */
class RunCommandInfo {
}
//# sourceMappingURL=run.js.map