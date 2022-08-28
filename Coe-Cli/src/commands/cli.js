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
exports.CLICommand = exports.CLIArguments = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ts_morph_1 = require("ts-morph");
const pascalcase = require("pascalcase");
const open = require("open");
const fsPromises = fs.promises;
/**
 * CLI commands
 */
class CLICommand {
    constructor(logger) {
        this.logger = logger;
        this.writeFile = async (name, content) => await fsPromises.writeFile(name, content);
    }
    /**
    * Open the about page for the cli
    */
    async about() {
        await open('https://aka.ms/coe-cli');
    }
    /**
     * Add a new script command
     * @param args
     * @returns
     */
    async add(args) {
        await this.createScript('source', args.name);
        await this.createScript('test', args.name);
        // TODO: Update commands.ts to include new command
        const project = new ts_morph_1.Project({ compilerOptions: { outDir: "dist", declaration: true, target: ts_morph_1.ts.ScriptTarget.Latest } });
        project.addSourceFilesAtPaths("src/**/*{.d.ts,.ts}");
        const sourceFile = project.getSourceFileOrThrow(path.join(process.cwd(), 'src/commands/commands.ts'));
        // TODO: Update commands.spec.ts to test new comamnd
        var imports = sourceFile.getImportDeclarations();
        await sourceFile.emit();
    }
    async createScript(type, name) {
        var _a, _b, _c, _d;
        let newCommandName = pascalcase(name);
        if (type == 'source') {
            let commmandScript = path.join(process.cwd(), `src/commands/${name.toLowerCase()}.ts`);
            if (!fs.existsSync(commmandScript)) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Creating ${commmandScript}`);
                await this.writeFile(commmandScript, `"use strict";
import * as winston from 'winston';

/**
 * ${newCommandName} commands
 */
class ${newCommandName}Command {
    logger: winston.Logger
    
    constructor(logger: winston.Logger) {
        this.logger = logger
    }

    /**
     * Execute the command
     * @param args 
     * @returns 
     */
    async execute(args: ${newCommandName}Arguments) : Promise<void> {
        this.logger?.info(args.comments)
        return Promise.resolve();
    }
}

/**
 * Ebook Command Arguments
 */
 class EbookArguments {
    /**
     * Some text argument
     */
    comments: string
}

export { 
    ${newCommandName}Arguments,
    ${newCommandName}Command
};`);
            }
            else {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info('Script file already exists');
            }
        }
        if (type == 'test') {
            let commmandScript = path.join(process.cwd(), `test/commands/${name.toLowerCase()}.spec.ts`);
            if (!fs.existsSync(commmandScript)) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating ${commmandScript}`);
                await this.writeFile(commmandScript, `"use strict";
import { ${newCommandName}Arguments, ${newCommandName}Command } from '../../src/commands/${name.toLowerCase()}';
import { mock } from 'jest-mock-extended';
import winston from 'winston';
            
describe('Related Tests', () => {
    test('Default', async () => {
        // Arrange
        let logger = mock<winston.Logger>()
        var command = new ${newCommandName}Command(logger);
        let args = new ${newCommandName}Arguments();
    
        // Act
        
        await command.execute(args)

        // Assert
    })
});
    `);
            }
            else {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info('Test script file already exists');
            }
        }
    }
}
exports.CLICommand = CLICommand;
/**
 * CLI Command Arguments
 */
class CLIArguments {
}
exports.CLIArguments = CLIArguments;
//# sourceMappingURL=cli.js.map