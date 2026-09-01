import React, { useState } from 'react';

// Comprehensive emoji library grouped by category so the picker can offer
// "all emojis" in one place. Click a char to insert it into the message.
export const EMOJI_GROUPS = [
  {
    name: 'Smileys',
    emojis: '😀😁😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫣🤭🫢🤫😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖😺😸😹😻😼😽🙀😿😾'.split(''),
  },
  {
    name: 'Gestures',
    emojis: '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🫱🫲🫳🫴🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄'.split(''),
  },
  {
    name: 'People',
    emojis: '👶👧🧒👦👩🧑👨👩🦱🧑🦱👨🦱👩🦰🧑🦰👨🦰👱👩🦳🧑🦳👨🦳👩🦲🧑🦲👨🦲🧔🧔♂️🧔♀️👵🧓👴👲👳👳♂️👳♀️🧕👮👮♂️👮♀️🕵️🕵️♂️🕵️♀️💂💂♂️💂♀️👷👷♂️👷♀️🤴👸👳👰👰♂️👰♀️🤵🤵♂️🤵♀️👼🎅🤶🦸🦸♂️🦸♀️🦹🦹♂️🦹♀️🧙🧙♂️🧙♀️🧚🧚♂️🧚♀️🧛🧛♂️🧛♀️🧜🧜♂️🧜♀️🧝🧝♂️🧝♀️🧞🧞♂️🧞♀️🧟🧟♂️🧟♀️💆💆♂️💆♀️💇💇♂️💇♀️🚶🚶♂️🚶♀️🧍🧍♂️🧍♀️🧎🧎♂️🧎♀️🏃🏃♂️🏃♀️💃🕺🕴️👯👯♂️👯♀️🧖🧖♂️🧖♀️🧗🧗♂️🧗♀️🤺🏇⛷️🏂🏌️🏌️♂️🏌️♀️🏄🏄♂️🏄♀️🚣🚣♂️🚣♀️🏊🏊♂️🏊♀️⛹️⛹️♂️⛹️♀️🏋️🏋️♂️🏋️♀️🚴🚴♂️🚴♀️🚵🚵♂️🚵♀️🤸🤸♂️🤸♀️🤼🤼♂️🤼♀️🤽🤽♂️🤽♀️🤾🤾♂️🤾♀️🤹🤹♂️🤹♀️🧘🧘♂️🧘♀️🛀🛌'.split(''),
  },
  {
    name: 'Animals',
    emojis: '🐶🐱🐭🐹🐰🦊🐻🐼🐻❄️🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷️🕸️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🦬🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🐈⬛🪶🐓🦃🦤🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦫🦦🦥🐁🐀🐿️🦔'.split(''),
  },
  {
    name: 'Food',
    emojis: '🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🫒🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼🫖☕🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊'.split(''),
  },
  {
    name: 'Travel',
    emojis: '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍️🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓🪝⛽🚧🚦🚥🚏🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🛖🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️'.split(''),
  },
  {
    name: 'Activity',
    emojis: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🪂🏋️🤼🤸⛹️🤺🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🏵️🎗️🎫🎟️🎪🤹🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🪗🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩'.split(''),
  },
  {
    name: 'Objects',
    emojis: '⌚📱📲💻⌨️🖥️🖨️🖱️🖲️🕹️🗜️💽💾💿📀📼📷📸📹🎥📽️🎞️📞☎️📟📠📺📻🎙️🎚️🎛️🧭⏱️⏲️⏰🕰️⌛⏳📡🔋🪫🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷🪙💰💳💎⚖️🪜🧰🪛🔧🔨⚒️🛠️⛏️🪚🔩⚙️🪤🧱⛓️🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️🪦⚱️🏺🔮📿🧿💈⚗️🔭🔬🕳️🩹🩺🩻🩼💊💉🩸🧬🦠🧫🧪🌡️🧹🪠🧺🧻🚽🚰🚿🛁🛀🪣🧼🪥🧽🪒🧴🛎️🔑🗝️🚪🪑🛋️🛏️🛌🧸🪆🖼️🪞🪟🛍️🛒🎁🎈🎏🎀🪄🪅🎊🎉🎎🏮🎐🧧✉️📩📨📧💌📥📤📦🏷️🪧📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒️🗓️📆📅🗑️📇🗃️🗳️🗄️📋📁📂🗂️🗞️📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇️📐📏🧮📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓'.split(''),
  },
  {
    name: 'Symbols',
    emojis: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯🕎☯️☦️🛐⛎♈♉♊♋♌♍♎♏♐♑♒♓🆔⚛️🉑☢️☣️📴📳🈶🈚🈸🈺🈷️✴️🆚💮🉐㊙️㊗️🈴🈵🈹🈲🅰️🅱️🆎🆑🅾️🆘❌⭕️🛑⛔📛🚫💯💢♨️🚷🚯🚳🚱🔞📵🚭❗❕❓❔‼️⁉️🔅🔆〽️⚠️🚸🔱⚜️🔰♻️✅🈯️💹❇️✳️❎🌐💠Ⓜ️🌀💤🏧🚾♿🅿️🛗🈳🈂️🛂🛃🛄🛅🚹🚺🚼⚧️🚻🚮🎦📶🈁🔣ℹ️🔤🔡🔠🆖🆗🆙🆒🆕🆓0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟🔢#️⃣*️⃣⏏️▶️⏸️⏯️⏹️⏺️⏭️⏮️⏩⏪⏫⏬◀️🔼🔽➡️⬅️⬆️⬇️↗️↘️↙️↖️↕️↔️↪️↩️⤴️⤵️🔀🔁🔂🔄🔃🎵🎶➕➖➗✖️🟰♾️💲💱™️©️®️👁️🗨️🔚🔙🔛🔝🔜〰️➰➿✔️☑️🔘🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🟫⬛⬜◼️◻️◾◽▪️▫️🔶🔷🔸🔹🔺🔻💠🔘🔳🔲'.split(''),
  },
];

export default function EmojiPicker({ onPick, darkMode }) {
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');

  // Search is done against category names (emoji do not carry searchable
  // labels in this build).
  const shownByName = query.trim() ? EMOJI_GROUPS.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase())) : [];

  return (
    <div className={`h-64 flex flex-col rounded-xl shadow-lg border overflow-hidden ${darkMode ? 'bg-[#1F2C34] border-black/40' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex-1 overflow-x-auto flex gap-1">
          {EMOJI_GROUPS.map((g, i) => (
            <button
              key={g.name}
              title={g.name}
              onClick={() => { setActive(i); setQuery(''); }}
              className={`px-2 py-1 rounded-lg text-sm shrink-0 ${
                active === i && !query.trim()
                  ? darkMode ? 'bg-[#2A3942] text-white' : 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A3942]'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 py-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emojis…"
          className={`w-full px-3 py-1 rounded-full text-sm outline-none ${
            darkMode ? 'bg-[#2A3942] text-white placeholder-gray-400' : 'bg-gray-100 text-gray-900'
          }`}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {(query.trim() ? shownByName : [EMOJI_GROUPS[active]]).map((g) => (
          <div key={g.name}>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 py-1 sticky top-0 bg-white dark:bg-[#1F2C34]">
              {g.name}
            </div>
            <div className="grid grid-cols-9 gap-0.5">
              {g.emojis.map((ch, i) => (
                <button
                  key={`${g.name}-${i}`}
                  onClick={() => onPick(ch)}
                  className="text-[22px] leading-8 hover:bg-gray-100 dark:hover:bg-[#2A3942] rounded-lg flex items-center justify-center"
                  title={ch}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        ))}
        {query.trim() && shownByName.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-6">No emoji category matches “{query}”</div>
        )}
      </div>
    </div>
  );
}