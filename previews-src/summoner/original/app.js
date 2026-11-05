const chalk = require('chalk');
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/Images', express.static(__dirname + '/Images'));
app.use('/js', express.static(__dirname + '/public/js'));
app.set('view engine', 'ejs');

let summonerSpellsArray = ['Heal', 'Flash', 'Teleport', 'Smite', 'Cleanse', 'Ignite', 'Ghost', 'Barrier', 'Exhaust', 'Clarity'];

let lengthOfArray = summonerSpellsArray.length;

function getRandomNum() {
    return Math.floor(Math.random() * lengthOfArray);
}

function pickRandomSpell() {
    return summonerSpellsArray[getRandomNum()];
}

function randomSpellGen() {
    let spellOne = pickRandomSpell();
    let spellTwo = pickRandomSpell();
    while (spellOne === spellTwo) {
        spellOne = pickRandomSpell();
    }
    return [spellOne, spellTwo];
}

app.get('/', (req, res) => {
    return res.render('index', { spells: randomSpellGen() });
});

app.post('/', (req, res) => {
    return res.render('index');
});

app.listen(process.env.PORT || 80, () => {
    console.log(chalk.bgBlue.bold(`Web Server Started: http://localhost`));
});
