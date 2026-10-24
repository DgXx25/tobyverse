export function studySheetSuggestedPrompts(ka: boolean): string[] {
  return ka
    ? ["ამ ჩანაწერში ყველაზე მნიშვნელოვანი რა არის?", "შეგიძლია ამ თემაზე ქვიზი შემიქმნა?"]
    : ["What are the key ideas in these notes?", "Can you make a quiz on this topic?"];
}
