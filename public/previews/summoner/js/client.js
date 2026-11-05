// the 2 randomized spells
const spell1 = document.getElementById("spell-1")
const spell2 = document.getElementById("spell-2")


let currentMapMode = "SR"

const spells = {
    Heal: true,
    Flash: true,
    Teleport: true,
    Smite: true,
    Cleanse: true,
    Ignite: true,
    Ghost: true,
    Barrier: true,
    Exhaust: true,
    Mark: false,
    Clarity: true,
};

// Returns all spells that are set to true
function getActiveSpells(mode) {
    const active = []

    // Loops through all spells if true add to active
    for (const s in spells) {
        const val = spells[s]

        if (val) active.push(s)
    }

    return active;
}

function toggleSpell(spellName) {

    if (spellName === "Mark" && currentMapMode !== 'ARAM') {
        return;
    }

    console.log(`Clicked: ${spellName}`);

    let element = document.getElementById(spellName);

    const spellValue = spells[spellName];
    console.log(spellValue);
    spells[spellName] = !spellValue;

    if (!spellValue) {
        element.style.filter = "";
    } else {
        element.style.filter = "grayscale(100%)";
    }
}

function randomizeSpells() {
    const activeSpells = getActiveSpells();

    if (activeSpells.length < 2) {
        window.alert("Pick 2 or more spells")
        return;
    }

    const randSpells = randomSpellGen(activeSpells)
    spell1.src = `Images/${randSpells[0]}.png`
    spell2.src = `Images/${randSpells[1]}.png`
}

function getRandomNum(arrayLength) {
    return Math.floor(Math.random() * arrayLength);
}

function pickRandomSpell(activeSpells) {
    return activeSpells[getRandomNum(activeSpells.length)];
}

function randomSpellGen(activeSpells) {
    let spellOne = pickRandomSpell(activeSpells);
    let spellTwo = pickRandomSpell(activeSpells);
    while (spellOne === spellTwo) {
        spellOne = pickRandomSpell(activeSpells);
    }
    return [spellOne, spellTwo];
}

function toggleAll() {
    for (const s in spells) {
        if (s === 'Mark' && currentMapMode === "SR") continue;

        const val = spells[s]
        spells[s] = !val

        const element = document.getElementById(s);


        if (!val) {
            element.style.filter = "";
        } else {
            element.style.filter = "grayscale(100%)";
        }
    }
}

function changeMapMode(mode) {
    if (mode === 'SR' && spells.Mark) {
        toggleSpell('Mark')
    }

    currentMapMode = mode;

    if (mode === "ARAM" && !spells.Mark) {
        toggleSpell('Mark')
    }
}