export function playAudio(src: string) {
    new Audio(src).play();
}

export function playPronunciation(word: string, accent: string) {
    const wordUrl =
        `https://dict.youdao.com/dictvoice?type=${accent}&audio=` + encodeURIComponent(word);
    playAudio(wordUrl);
}
