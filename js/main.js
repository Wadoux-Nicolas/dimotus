var pseudoForm = document.querySelector('#pseudo-form');
var pseudoInput = pseudoForm.querySelector('input');

pseudoForm.addEventListener('submit', e => {
    e.preventDefault();

    if (pseudoInput.value) {
        let pseudo = pseudoInput.value;

        window.location.href = `./game?pseudo=${pseudo}`;
    }
});