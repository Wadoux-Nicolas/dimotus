const express = require("express");
const app = express();

const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const randomWordFR = require('random-word-fr');

const ejs = require("ejs");
bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use("/css", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));


const MIN_PLAYERS = 2;
const GAME_WAIT_PLAYER = 'wait_player';
const GAME_WAIT_WORD = 'wait_word';
const GAME_PLAY = 'play';
const GAME_ENDED = 'ended';
const MIN_WORD_LENGTH = 6;
const MAX_WORD_LENGTH = 12;
const LETTER_VALID = 'valid';
const LETTER_EXISTS = 'exists';
const LETTER_NOT_EXISTS = 'not_exists';
const GAME_TRY = 8;
const PSEUDO_MIN_LENGTH = 1;
const PSEUDO_MAX_LENGTH = 20;

// --- ROUTES ---

// Home
app.get('/', (req, res) => {
    res.render('index', {
        minPseudoLength: PSEUDO_MIN_LENGTH,
        maxPseudoLength: PSEUDO_MAX_LENGTH,
    });
});

// Rules
app.get('/rules', (req, res) => {
    res.render('rules', {
        minPlayers: MIN_PLAYERS,
        minWordLength: MIN_WORD_LENGTH,
        maxWordLength: MAX_WORD_LENGTH,
        guesses: GAME_TRY,
    });
});

// Game
app.get('/game', (req, res) => {
    let pseudo = req.query.pseudo;

    // check if pseudo is a valid string, we don't check other pseudo because having same pseudo isn't a problem in this game
    if(typeof pseudo !== 'string' || pseudo.length < PSEUDO_MIN_LENGTH || pseudo.length > PSEUDO_MAX_LENGTH) {
       res.render('error', {error: 'Le pseudo n\'est pas une chaîne de caractères valide (minimum ' + PSEUDO_MIN_LENGTH + ' caractère, maximum ' + PSEUDO_MAX_LENGTH + ')'});
    }

    res.render('game', {
        pseudo: pseudo,
        parameters: {
            minLength: MIN_WORD_LENGTH,
            maxLength: MAX_WORD_LENGTH,
        }
    });
});

// Get a random french word
app.get('/random', (req, res) => {
    let suggestion = null;
    while(suggestion === null) {
        let word = randomWordFR();

        if(word.match(/^[A-Za-zÀ-ÖØ-öø-ƿǄ-ɏ]+$/)) {
            if(word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH) {
                suggestion = word;
            }
        }
    }
    res.send({suggestedWord: suggestion});
});

// --- Socket ---

let players = [];
let playersSockets = {};
let game_status = GAME_WAIT_PLAYER;
let game_word = null;
let game_master = null;

io.on('connection', (socket) => {

    // --- prevent joining game when party has started ---

    if(![GAME_ENDED, GAME_WAIT_PLAYER].includes(game_status)) {
        socket.emit('game_already_started');
        socket.disconnect();
        return;
    }

    // --- check pseudo is string ---

    let pseudo = socket.request._query['pseudo'];
    if(typeof pseudo !== 'string' || pseudo.length < 1) {
        error('Le pseudo n\'est pas une chaîne de caractères valide');
    }
    console.log(socket.id + ' connected, named ' + pseudo);
    
    let playerObj = {
        id: socket.id,
        isReady: false,
        guesses: 0,
        pseudo: pseudo,
    };

    // emit connected players with himself ordered first
    socket.emit('player_connected', [playerObj, ...players]);

    // add player to game
    players.push(playerObj);
    playersSockets[playerObj.id] = socket;
    io.emit('new_player_connected', playerObj);

    // --- when one player set to ready ---

    socket.on('player_ready', (ready) => {
        // address reference
        playerObj.isReady = !!ready;
        io.emit('player_status_changed', playerObj);
        console.log(playerObj.pseudo + ' is ready ? ' + ready);

        if(players.length >= MIN_PLAYERS && players.every(p => p.isReady)) {
            startGame();
        }
    })

    // --- When one player try to guess a word ---

    socket.on('guess', (guessedWord) => {
        guess(guessedWord, playerObj);
    })

    // --- when one player is disconnected ---

    socket.on('disconnect', () => {
        disconnect(socket);
    });
});

server.listen(3308);

// choose a game master and launch game
function startGame() {
    io.emit('game_started');

    // randomly choose a player as game master    
    game_status = GAME_WAIT_WORD;
    game_master = {...players[Math.floor(Math.random() * players.length)]};
    game_master.socket = playersSockets[game_master.id];

    console.log('master ' + game_master.pseudo);
    game_master.socket.emit('ask_for_word');

    // when we get the word
    game_master.socket.on('new_word', (word) => {
        if(checkWordIsString(word, game_master.socket)) {
            game_word = word.toLowerCase();
            console.log('Chosen word: ' + game_word);
            lauchGuess();
        }
    });
}

// emit guesses number and first letter
function lauchGuess() {
    game_status = GAME_PLAY;
    
    io.emit('play', {
        wordLength: game_word.length,
        firstLetter: game_word.charAt(0),
        try: GAME_TRY,
    });
}

// check if word is string
function checkWordIsString(word, concernedSocket) {
    if(typeof word === 'string') {
        let wordLength = word.length;

        if(!(wordLength >= MIN_WORD_LENGTH && wordLength <= MAX_WORD_LENGTH)) {
            error('Le mot est trop ' + (wordLength < MIN_WORD_LENGTH ? 'petit' : 'grand'), concernedSocket);
            return false;
        }

        // all letter on unicode table (even letter like œ, ç, Ø etc)
        if(!word.match(/^[A-Za-zÀ-ÖØ-öø-ƿǄ-ɏ]+$/)) {
            error('Le mot ne doit pas contenir de caractère comme : - * / [] () etc, ni de chiffre', concernedSocket);
            return false;
        }

        return true;
    } else {
        error('Le mot n\'est pas une chaine de caractères', concernedSocket);
        return false;
    }
}

function error(message, concernedSocket) {
    concernedSocket.emit('logic_error', {
        message: message,
    });
}

// when a socket is disconnected
function disconnect(socket) {
    console.log(socket.id + ' disconnected');
        
    const removedPlayerIndex = players.findIndex((player) => {
        return player.id === socket.id;
    });

    // check if socket was added to the game
    if(removedPlayerIndex >= 0) {
        let removedPlayer = players[removedPlayerIndex];
        io.emit('player_disconnected', removedPlayer);
        delete playersSockets[removedPlayer.id];
        players.splice(removedPlayerIndex, 1);

        //end game only if master is disconnected before chosing a word
        let gameMasterFatalDisconnection = socket.id === game_master?.id && game_status === GAME_WAIT_WORD;
        if(
            (players.length < 2 || gameMasterFatalDisconnection)
            && game_status !== GAME_WAIT_PLAYER
        ) {
           io.emit('game_ended');
           game_status = GAME_ENDED;
           return;
        }
    }
}

// when a player guess
function guess(guessedWord, playerObj) {
    let socket = playersSockets[playerObj.id];

    if(game_status !== GAME_PLAY || socket.id === game_master.id) {
        error(game_status !== GAME_PLAY ? 'Le jeu n\'a pas commencé' : 'Vous ne pouvez pas deviner votre propre mot', socket);
        return;
    }

    if(checkWordIsString(guessedWord, socket)) {
        if(guessedWord.length !== game_word.length) {
            error(`Le mot ne fait pas ${game_word.length} lettres`, socket);
            return;
        }

        if(playerObj.guesses + 1 > GAME_TRY){
            error('Vous n\'avez plus d\'essai', socket);
            return;
        }

        playerObj.guesses += 1;

        guessedWord = guessedWord.toLowerCase().split('');
        wordLetters = game_word.split('');

        let results = [];

        // first get valid letters
        guessedWord.forEach((letter, i) => {
            let resultLetter = {
                letter: letter,
                status: null,
            };
            
            if(letter === game_word[i]) {
                resultLetter.status = LETTER_VALID;
                wordLetters.splice(
                    wordLetters.findIndex(c => c === letter)
                , 1);
            }
            
            results.push(resultLetter);
        });

        // full valid word
        if(results.every(r => r.status === LETTER_VALID)) {
            io.emit('game_won', {
                results: results,
                winner: {
                    id: socket.id,
                    pseudo: playerObj.pseudo,
                },
                guesses: playerObj.guesses,
            });
            console.log('game won');

            // game ended, we disconnect everybody
            playersTemp = [...players];
            players = [];
            playersTemp.forEach((player, i) => {
                players.splice(i, 1);
                playersSockets[player.id].disconnect();
            });
            game_status = GAME_WAIT_PLAYER;
        } else {
            // we get existing letters
            results.forEach((resLetter, i) => {
                if(resLetter.status !== LETTER_VALID) {
                    if(wordLetters.includes(resLetter.letter)){
                        resLetter.status = LETTER_EXISTS;
                        wordLetters.splice(
                            wordLetters.findIndex(c => c === resLetter.letter)
                        , 1);
                    } else {
                        resLetter.status = LETTER_NOT_EXISTS;
                    }
                }
            });

            socket.emit('guess_result', results);
            game_master.socket.emit('master_player_try', {
                results: results,
                pseudo: playerObj.pseudo,
            });
       
            // word not full right and no more try for any player
            if (!players.some(p => p.guesses < GAME_TRY && p.id !== game_master.id)) {
                io.emit('game_loose', {
                    word: game_word,
                });
            } 
        }

    }
}