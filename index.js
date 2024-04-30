#!/usr/bin/env node
import * as url from 'url';
import path from 'path';
import { globby } from 'globby';
import { readFileSync, writeFileSync, existsSync } from "fs";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

function stripIt(ins) {
  return ins.replace(/( |\r\n|\n|\r)/gm,"");
}

async function main(options) {
    var configFile = path.join(__dirname, options.config);
    const try1 = configFile;

    if(!existsSync(configFile)) {
        configFile = path.join(options.config);
    }

    if(!existsSync(configFile)) {
       throw `enablement-build-template-generate: could not load config file ${configFile}, also tried ${try1}`;
    }

    const templatePath = path.dirname(configFile);

    const config = JSON.parse(readFileSync(configFile,'utf8'));

    const plist = [];

    Object.keys(config).forEach((templateFilename)=>{

        plist.push(new Promise(async (primaryResolve, reject) => {

            const docTemplate = readFileSync(path.join(templatePath, templateFilename), "utf8");
            const jlist = [];
            Object.keys(config[templateFilename]).forEach((varname)=>{
                const jobConfig = config[templateFilename][varname];
                const job = new Promise(async (resolve, reject) => {
                    const jobTemplate = readFileSync(path.join(templatePath, jobConfig.template), "utf8");
                    const cwd = path.join(templatePath, jobConfig.rootPath);

                    let jobRoot = jobConfig.rootPath;
                    jobRoot.substring(0, Math.max(jobRoot.lastIndexOf("/"), jobRoot.lastIndexOf("\\")));

                    globby(
                        [
                            `./**/package.json`,
                            `!**/node_modules`
                        ],
                        { cwd: cwd },
                    ).then((images)=>{
                        images.sort();
                        let jobs = [];
                        let exclude = jobConfig.exclude||[];
                        const allNames = [];

                        for (let i = 0; i < images.length; i++) {
                            let name = images[i].replace(/\/package\.json/g, '');
                            allNames.push(name);
                            if(name.startsWith("_")) continue;

                            const packageJson = JSON.parse(readFileSync(path.join(cwd,images[i]),'utf8'));
                            let fullName = packageJson.name;
                            let packageName = packageJson.name;
                            if(packageName.startsWith('@')) {
                                packageName = packageName.split("\/")[1];
                            }

                            let job = jobTemplate;
                            if(exclude.indexOf(name)>=0) continue;
                            let safe = name.replace(/-/g, '_');
                            job = job.replace(/{other}/g, `{other:${name}}`).replace(/{path}/g,jobRoot).replace(/{name}/g, name).replace(/{safe}/g, safe).replace(/{package}/g, packageName).replace(/{full}/g, fullName);
                            jobs.push(job);
                        }

                        jobs = jobs.join('\n');
                        for (let i = 0; i < allNames.length; i++) {
                            let cnames = allNames.slice();
                            cnames.splice(i,1);
                            cnames = cnames.join(`, ${cwd}/`);
                            let rex = `{other:${allNames[i]}}`;
                            rex=new RegExp(rex,'g');
                            jobs = jobs.replace(rex, `${cwd}/${cnames}`);
                        }

                        resolve({name:varname, text:jobs});
                    },reject);

                });
                jlist.push(job);
            });

            Promise.all(jlist).then((results)=>{
                var output = docTemplate;

                Object.keys(results).forEach((idx)=>{
                    const varname = results[idx].name;
                    let rex = new RegExp('\\{'+varname+'\\}',"g");
                    output = output.replace(rex, results[idx].text);
                });

                const line = "#######################################";
                const donotedit = "### DO NOT EDIT - THIS IS GENERATED ###";
                output = `${line}\n${donotedit}\n${line}\n\n${output}\n\n${line}\n${donotedit}\n${line}`;

                if(stripIt(output)!==docTemplate) {
                  const outFile = path.join(templatePath, `../${templateFilename}`);
                  writeFileSync(path.join(templatePath, `../${templateFilename}`), output, "utf8");
                }

                primaryResolve(`generated template ${templateFilename}`);
            },reject);
        }));
    })

    return Promise.all(plist);
}

let options = {
    config: "./.cicd/templates/templated.json",
    debug: false,
    push: true
}

let argv = process.argv;

for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--debug") { options.debug = true; continue; }
    if (argv[i].substring(0, 2) === "--") {
        let name = argv[i].substring(2);
        if (options[name] !== undefined) {
            options[name] = argv[i + 1];
            i++;
        } else {
            console.error('Expected a known option');
            process.exit(1);
        }
    }
}

(async () => {
    try {
        console.log('\x1b[32m%s\x1b[0m', "Running enablement-build-template-generate with options:\n", JSON.stringify(options, null, 2));
        main(options).then((results) => {
            console.log(results.join('\n'));
            if (options.debug) console.log("DONE");
            process.exit(0);
        }, (e) => {
            console.log('\x1b[32m%s\x1b[0m',e);
            if (options.debug) console.log("ERROR");
            process.exit(1);
        })
    } catch (e) {
        console.log('\x1b[32m%s\x1b[0m',e);
        process.exit(1);
    }
})();
