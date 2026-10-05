// function LetterCapitalize(str) {
//   return str
//     .split(" ")
//     .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
//     .join(" ");
// }

// console.log(LetterCapitalize("hello world  a b"));

// function FirstFactorial(num) {
//   let result = 1;
//   for (let i = 1; i <= num; i++) {
//     result *= i;
//   }
//   return result;
// }

// console.log(FirstFactorial(4));

// function LongestWord(sen) {
//   const words = sen.split(" ").map((word) => word.replace(/[^a-zA-Z]/g, ""));

//   return words.reduce((acc, curr) => {
//     return acc.length < curr.length ? curr : acc;
//   }, words[0]);
// }

// console.log(LongestWord("fun&&& time prayuda"));

function ShortestWord(sen) {
  const words = sen.split(" ").map((word) => word.replace(/[^a-zA-Z]/g, ""));

  return words.reduce((acc, curr) => {
    return acc.length > curr.length ? curr : acc;
  }, words[0]);
}

console.log(ShortestWord("fun&&& time prayuda"));
