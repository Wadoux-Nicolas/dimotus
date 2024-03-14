//defered script

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
var pseudo = urlParams.get('pseudo');
var socket = io('', {query: `pseudo=${pseudo}`});

const LETTER_VALID = 'valid';
const LETTER_EXISTS = 'exists';
const LETTER_NOT_EXISTS = 'not_exists';

var ready = false;
var trys = 0; 
var firstLetter = null;
var wordLength = null;
var currentRowI = 0;
var isMaster = false;

var errorText = document.querySelector('#error');
var waitingRoomSection = document.querySelector('#waitingRoom'); 
var waitingWordSection = document.querySelector('#waitingWord'); 
var gameSection = document.querySelector('#gameScreen'); 
var masterSection = document.querySelector('#masterScreen');
var winText = document.querySelector('#winText');
var looseText = document.querySelector('#looseText');
var masterGameSection = document.querySelector('#masterGameWait');
var gameHasStartedSection = document.querySelector('#gameHasStarted');
var masterGameEndedSection = document.querySelector('#masterGameEnded');
var screens = [
    waitingRoomSection,
    waitingWordSection,
    gameSection,
    masterSection,
    masterGameSection,
    gameHasStartedSection,
    masterGameEndedSection,
];

var playersList = document.querySelector('#playersList');
var masterForm = document.querySelector('#master-input');
var masterInput = masterForm.querySelector('input');
var wordForm = document.querySelector('#guess-input');
var wordInput = wordForm.querySelector('input');
var randomWordBtn = document.querySelector('#randomWord');
var playAgainGame = document.querySelector('#playAgainFromGame');
var actionList = document.querySelector('#actionList');
var displayActionList = document.querySelector('#displayActionList');

var play_btn = document.querySelector('#play');
var grid = document.querySelector('#grid');
var masterResult = masterGameEndedSection.querySelector('#masterResult');
var wholeGameLooseText = gameSection.querySelector('#wholeGameLooseText');

// set status to ready or not ready
play_btn.addEventListener('click', () =>  {
    ready = !ready;
    socket.emit('player_ready', ready);
    play_btn.textContent = ready ? 'Je ne suis plus prêt' : 'Je suis prêt';
});

// hide player actions for master (to prevent giving information on screen)
displayActionList.addEventListener('click', () => {
    actionList.classList.toggle('hidden');
});

// reload page => replay
document.querySelectorAll('.reloadBtn').forEach(button => {
    button.addEventListener('click', () => {
        location.reload();
    })
});

// get random word
randomWordBtn.addEventListener('click', () => {
    fetch('/random', { 
        method: "GET",
    })
    .then(response => response.json())
    .then(data => {
        masterInput.value = data.suggestedWord;
    });
});

// player guess a word
wordForm.addEventListener('submit', e => {
    e.preventDefault();
    if (wordInput.value) {
        socket.emit('guess', wordInput.value);
        wordInput.value = '';
    }
});

// master submit the word
masterForm.addEventListener('submit', e => {
    e.preventDefault();
    if (masterInput.value) {
        socket.emit('new_word', masterInput.value);
        masterInput.value = '';
    }
});

// list of connected player when joining
socket.on('player_connected', players => {
    players.forEach(player => {
        let playerName = player.pseudo + (player.id === socket.id ? ' (moi)' : '');
        _("li", playerName, playersList, 'player-'+player.id, player.isReady ? 'ready' : '');
    });
});

// new player join the game
socket.on('new_player_connected', player => {
    if(player.id !== socket.id) {
        _("li", player.pseudo, playersList, 'player-'+player.id);
    }
});

// when a status in the waiting room changed
socket.on('player_status_changed', player => {
    playerDiv = document.querySelector('#player-'+player.id);
    playerDiv.classList.toggle('ready');
});

// when someone is disconnected
socket.on('player_disconnected', player => {
    playerDiv = document.querySelector('#player-'+player.id).remove();
});

// game starts
socket.on('game_started', () => {
    // reset master status
    isMaster = false;
    hideScreens();
    waitingWordSection.classList.remove('hidden');
});

// try to join game but has already started
socket.on('game_already_started', () => {
    hideScreens();
    gameHasStartedSection.classList.remove('hidden');
});

// Client is the game master, he has to choose a word
socket.on('ask_for_word', () => {
    hideScreens();
    isMaster = true;
    masterSection.classList.remove('hidden');
});

// Game master has chosen a word, game for players starts
socket.on('play', infos => {
    hideScreens();

    if(isMaster) {
        masterGameSection.classList.remove('hidden');
        return;
    }

    trys = infos.try;
    firstLetter = infos.firstLetter;
    wordLength = infos.wordLength;

    gameSection.classList.remove('hidden');

    // generate grid
    for(let rowI = 0; rowI < trys; rowI++) {
        let row = _('tr', null, grid, 'row-' + rowI);
        for(let cellI = 0; cellI < wordLength; cellI++){
            _('td', '', row, 'row-' + rowI + '-cell-' + cellI);
        }
    }

    document.querySelector('#row-0-cell-0').textContent = firstLetter;
});

// tried to guess the word, here are the results
socket.on('guess_result', results => {
    fillRow(results);
    if(currentRowI < trys) {
        let nextCell = document.querySelector('#row-' + currentRowI + '-cell-0');
        nextCell.textContent = firstLetter;
    }
});

// As master, we can get log of what players guesses
socket.on('master_player_try', data => {
    let guess = _('li', data.pseudo + ' - ', actionList);
    data.results.forEach(letter => {
        _('span', letter.letter.toUpperCase(), guess, '', letter.status);
    })
});

// Game won by someone
socket.on('game_won', results => {
    if(isMaster) {
        hideScreens();
        masterGameEndedSection.classList.remove('hidden');
        masterResult.textContent = `${results.winner.pseudo} a trouvé ton mot en ${results.guesses} essai(s)`;
    } else {
        fillRow(results.results, true);
        wordForm.classList.add('hidden');
        if(socket.id === results.winner.id) {
            winText.classList.remove('hidden');
        } else {
            looseText.classList.remove('hidden');
        }
        playAgainGame.classList.remove('hidden');
    }
});

// Nobody found the word
socket.on('game_loose', results => {
    if(isMaster) {
        hideScreens();
        masterGameEndedSection.classList.remove('hidden');
        masterResult.textContent = 'Personne n\'a trouvé le mot, tu as gagné';
    } else {
        wordForm.classList.add('hidden');
        looseText.classList.remove('hidden');
        grid.classList.add('disabled');
        wholeGameLooseText.textContent = `Tout le monde à perdu, le mot était : ${results.word}`;
        wholeGameLooseText.classList.remove('hidden');
        playAgainGame.classList.remove('hidden');
    }
});

// We get an error from the socket
var errorTimeout = null;
socket.on('logic_error', error => {
    clearTimeout(errorTimeout);
    
    errorText.textContent = error.message;
    errorText.classList.remove('hidden');

    errorTimeout = setTimeout(() => {
        errorText.classList.add('hidden');
        errorText.textContent = '';
        errorTimeout = null;
    }, 5*1000);
});

// game ended (mainly by fatal disconnection like < 2 players left or by the game master during word selection)
socket.on('game_ended', () => {
    hideScreens();
    ready = false;
    isMaster = false;
    grid.innerHTML = '';
    actionList.innerHTML = '';
    waitingRoomSection.classList.remove('hidden');
});

// Fill grid row by the guess results, to show valid and existing letters
// Also used to fill row when someone else found the word
function fillRow(results, forceDisplay = false) {
    let rowIToUpdate = currentRowI;
    let hadToForce = false;
    
    // when all tries used, update the last row to show response find by someone else
    if(currentRowI >= trys && forceDisplay) {
        rowIToUpdate = trys-1;
        hadToForce = true;
    }

    let currentRow = document.querySelector('#row-' + rowIToUpdate);

    for(let cellI = 0; cellI < wordLength; cellI++){
        let cell = currentRow.querySelector('#row-' + rowIToUpdate + '-cell-' +cellI);
        let result = results[cellI];

        cell.textContent = result.letter;

        if(result.status === LETTER_VALID) {
            cell.classList.add('valid');
            if(hadToForce) {
                // in case showing result on last used line
                cell.classList.add('force-validity');
            }
        } else if (result.status === LETTER_EXISTS) {
            cell.classList.add('exists');
        }

    }

    currentRowI++;

    if(currentRowI >= trys) {
        grid.classList.add('disabled');
    }
}

// reset view
function hideScreens() {
    screens.forEach(screen => {
        screen.classList.add('hidden');
    })
    winText.classList.add('hidden');
    looseText.classList.add('hidden');
    playAgainGame.classList.add('hidden');
    wordForm.classList.remove('hidden');
    grid.classList.remove('disabled');
    wholeGameLooseText.classList.add('hidden');
}

// create element
function _(tag, content, parent, id=null, classs=null) {

	let element = document.createElement(tag);
	
	if (content)
		element.appendChild(document.createTextNode(content));
	if (id)
		element.id = id;
	if (classs)
		element.classList.add(classs);

	parent.appendChild(element);

	return element;
}