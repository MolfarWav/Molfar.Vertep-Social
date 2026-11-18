<!-- source: f3da32e5a456 -->
# Social: Messenger

Messenger to czat z postaciami, które żyją w Social. Widzisz listę kontaktów, rozmowę z wybranym kontaktem i kartę z ich danymi. Każdy, kto chce porozmawiać z postacią w cztery oczy, zaczyna tutaj.

## Lista kontaktów

Kontakty są pogrupowane według statusu: **Online**, **Away**, **Do not disturb**, **Unavailable** i **Offline**, każda grupa z liczbą. W grupie kontakty z nową wiadomością są pierwsze, potem najnowsza rozmowa, a reszta według imienia. Kliknij tytuł grupy, żeby ją zwinąć. Obok każdego imienia stoi kwiatek. Jego kolor, znak w środku i słowo w nagłówku czatu mówią o statusie. Kontakt z czekającą wiadomością pokazuje kopertę zamiast kwiatka i pogrubione imię.

Wpisz w "Find a contact", żeby filtrować listę po imieniu. Jeśli nikt nie pasuje, lista to mówi i proponuje "Clear search". Twój własny status ("My status") jest na dole listy na komputerze, a na górze na telefonie. Na telefonie ikona lupy w górnym pasku otwiera pole wyszukiwania.

## Rozmowa

Wybierz kontakt, żeby otworzyć czat. Twoje wiadomości i ich są liniami z kolorowym imieniem i godziną, a nie dymkami. Pisz w polu i naciśnij Enter, żeby wysłać; Shift+Enter zaczyna nową linię. "Clear" czyści pole.

Status zmienia zachowanie postaci. Postać online odpowiada w ciągu sekund. Postać away odpowiada w ciągu kilku minut. Postać offline dostaje wiadomość i odpowie, gdy wróci; czat mówi, że wtedy zostanie na nią odpowiedziane. Gdy odpowiedź jest w drodze, widzisz "<name> is typing…". Jeśli odpowiedź nie nadejdzie, czat mówi, co poszło nie tak, i proponuje "Try again". Jeśli dla Messengera nie wybrano modelu, czat o tym mówi i prowadzi do ustawień.

### Pamięć i nowa rozmowa

Postać widzi najnowsze 24 wiadomości czatu przy każdej odpowiedzi (od 4 do 500 w Settings, Messenger, "Messages a character remembers"; patrz [[settings]]). Starsze wiadomości nie giną: gdy wypadną z okna, jedno wywołanie modelu co jakiś czas składa je w krótką **notatkę**, która idzie do modelu razem z najnowszymi wiadomościami. Notatka jest pod "Memory" w karcie informacji na komputerze; przycisk "Memory and conversation…" tam, albo przycisk z książką w górnym pasku czatu na telefonie, ją otwiera. Możesz notatkę przeczytać, edytować i nacisnąć "Save note": to, co wpiszesz, ją zastępuje, a model dopisuje do niej później. "Note of older messages" w Settings wyłącza składanie.

**Recall** to kolejny krok dla długiego czatu (Settings, Messenger, "Recall older messages", domyślnie wyłączone). Notatka zachowuje sens, ale szczegół, taki jak imię zwierzaka albo plan, może w niej zginąć. Przy włączonym Recall każda odpowiedź dostaje też do trzech starszych wiadomości z tej rozmowy, które są najbliższe temu, o czym teraz mowa, słowo w słowo, z datą i godziną, żeby postać mogła ich użyć, jeśli pasują. Liczą się tylko wiadomości po ostatniej linii podziału i poza najnowszym oknem; sama fotografia albo naklejka się nie liczy, a dwie wiadomości oddalone o kilka minut liczą się jako jedna. Jeśli aplikacja ma model embeddings, dopasowanie idzie po znaczeniu; jeśli nie, albo przez pół godziny po błędzie, po słowach. Nic nie pokazuje się w czacie i nic nie jest w nim zapisywane: przygotowane dane to pamięć podręczna, która znika razem z czatem, gdy go wyczyścisz lub usuniesz.

W tym samym oknie **New conversation…** wstawia linię podziału do dziennika. Postać nie widzi nic sprzed niej. "Keep the note and start" najpierw składa wiadomości, których nie ma jeszcze w notatce (jedno wywołanie modelu), żeby postać nadal pamiętała sens; "Start without the note" zaczyna od zera. Stare wiadomości zostają w czacie nad linią podziału. **Clear chat…** kasuje całą historię i notatkę, po pytaniu; nie można tego cofnąć.

Czat należy do pary: postaci i persony, która była aktywna, gdy go pisano (patrz [[you]]). Przy jednej personie nic się nie zmienia. Przy kilku każda persona ma osobny czat i notatkę z każdą postacią, a Messenger pokazuje czaty aktywnej persony; nagłówek mówi "as <name>". Czaty, które zrobiłeś, zanim persony miały własne, trafiły do persony aktywnej, gdy po aktualizacji pierwszy raz otworzyłeś Messenger. Usunięcie persony usuwa jej czaty.

Od tego, jak dobrze postać cię zna, też można wybrać: "Characters know you" w Settings (domyślnie) albo "How well it knows you" w zakładce Voice profilu. **Knows you** podaje modelowi imię i "About" aktywnej persony; **Name only** tylko imię; **Stranger** nic nie podaje, a postać dowiaduje się o tobie tylko z tego, co napiszesz. Forum stosuje ten sam wybór (patrz [[forum]]). Wiadomość w podwójnych nawiasach, jak ((to)), albo zaczynająca się od OOC, to ty mówisz poza rolą: postać odpowiada na nią krótko i wprost, a potem wraca do rozmowy.

### Emoji

Przycisk z uśmiechem obok pola wiadomości ("Emoji") otwiera wybór z polem wyszukiwania, grupami (smileys, people, animals, food, travel, activities, objects, symbols, flags) i emoji, których ostatnio używałeś. Kliknij emoji, żeby wstawić je przy kursorze albo zamiast zaznaczonego tekstu; wybór się zamyka i piszesz dalej. Przytrzymaj Shift podczas klikania, żeby wybór pozostał otwarty i dodać kilka. Wpisz w "Search emoji", żeby znaleźć emoji po nazwie po angielsku lub ukraińsku; Enter wybiera pierwszy wynik. Sześć kropek na dole ("Skin tone") zmienia odcień emoji, które go mają, a wybór jest zapamiętywany, podobnie jak ostatnie. Na telefonie wybór otwiera się pod polem wiadomości, a nie nad nim, i zostaje otwarty, aż naciśniesz krzyżyk albo przycisk z uśmiechem. Strzałki poruszają się między emoji, a Escape zamyka wybór.

Social ma własną czcionkę emoji, więc emoji wyglądają tak samo na Windows, Androidzie i Linuksie; Safari rysuje je po swojemu. Postacie też piszą emoji: jak często, ustawia się dla każdej postaci, patrz "Writing manner" w [[profiles]].

Na komputerze karta po prawej pokazuje harmonogram (kiedy postać będzie następnym razem online) i jak szybko odpowiada. Postać może też napisać pierwsza: postać online, mająca coś z własnych dni albo ze świata zewnętrznego, otwiera czat z tobą (patrz [[life]]), w ramach dziennego limitu w Settings. To, jak blisko postać czuje się do twojej aktywnej persony (patrz [[life]], lista osób), decyduje, kto zaczyna czat: obcy rzadko, bliski przyjaciel często, a bliski przyjaciel (albo przyjaciel, przy którym jest ciepło), który nie miał od ciebie wieści przez trzy dni, może napisać tylko po to, żeby zapytać, co u ciebie, bez własnych nowości. Taka wiadomość jest nieprzeczytana, dopóki nie otworzysz czatu.

Od czasu do czasu postać może też w rozmowie z tobą poruszyć coś z forum, własnymi słowami i nie jako pewny fakt: plotkę, którą opowiedziała albo usłyszała w ciągu ostatnich trzech dni (nigdy o sobie, nigdy nic z innego prywatnego czatu). Settings > Community > Gossip włącza to lub wyłącza razem z plotką na forum. Czy postać pisze pierwsza, nie jest pokazane na karcie. "Open profile" prowadzi do jej profilu. Na telefonie czat zajmuje cały ekran; strzałka u góry wraca do listy.

### Naklejki i własne emoji

Pod grupami wyboru jest drugi wiersz na twoje własne pakiety. Pakiet to zestaw obrazków, które sam dodałeś: **Stickers** wysyła się jako całą wiadomość, dużą i samą; **Custom emoji** to małe obrazki, które stoją w linii tekstu, jak w Telegramie czy Discordzie. Naciśnij plus w tym wierszu ("Manage packs"), żeby otworzyć "Sticker packs": wpisz nazwę, wybierz Stickers albo Custom emoji, naciśnij "Choose pictures…" i zaznacz kilka plików naraz (PNG, WebP, GIF lub JPEG, do 512 KB po przeskalowaniu, 200 w pakiecie; naklejki są skalowane do 512 px, własne emoji do 64 px; SVG nie jest przyjmowany). Animowane obrazki zostają w ruchu: GIF i animowany WebP (albo APNG) są zapisywane tak, jak są, nigdy nie są przeskalowywane, więc rysuj je w rozmiarze, jaki chcesz, i w 512 KB; animowany WebP jest dużo mniejszy od GIF-a tej samej grafiki. Każdy pakiet można przemianować, zmienić między dwoma rodzajami, dostać więcej obrazków, stracić pojedyncze obrazki krzyżykiem albo usunąć (po pytaniu). Wszystko zapisuje się na bieżąco.

**Pakiet Molfar jest dołączony do aplikacji.** Na górze "Sticker packs" jest karta "Molfar pack" z ośmioma twarzami Molfara (starszy pan z cyberoczkiem) w ośmiu nastrojach: happy, laughing, sad, love, smug, sleepy, suspicious, deadpan. Naciśnij "Add the Molfar pack", a dostaniesz dwa pakiety: "Molfar" (animowane naklejki) i "Molfar emoji" (te same twarze jako małe własne emoji); karta znika. To zwykłe pakiety: przemianuj je, usuń albo rozszerz. Po usunięciu jednego karta wraca, więc możesz je dodać ponownie. Przy wysokości linii emoji są małe, więc nastroje odróżnia się przede wszystkim po naklejkach.

**Free packs.** W "Sticker packs" karta "Free packs" otwiera katalog pakietów innych artystów (obecnie animowane emoji Noto od Google, CC BY 4.0, i emoji Fluent 3D od Microsoftu, MIT). Każda karta pokazuje podgląd, autora, licencję i link do źródła. "Add the pack" pobiera jego obrazki i tworzy z nich zwykły pakiet twój; autor i licencja zostają przy pakiecie w menedżerze. Pakiet, który już dodałeś, pokazuje "Added" (usuń go, żeby dodać ponownie). Lista jest czytana z GitHuba, gdy ją otworzysz, więc potrzebne jest połączenie z internetem; jeśli nie da się jej wczytać, widzisz dlaczego i przycisk "Try again". W katalogu pojawiają się tylko pakiety, które właściciel Social umieścił w katalogu, zawsze z wolną licencją (CC0, CC BY lub MIT).

W wierszu pojawia się zakładka z pierwszym obrazkiem pakietu. Dotknij naklejki, żeby ją od razu wysłać (tekst, który pisałeś, zostaje); dotknij własnego emoji, żeby wstawić je w tekst przy kursorze. Pole wyszukiwania znajduje obrazki także po nazwie, a ostatnie są wspólne z emoji. Własne emoji zapisuje się w tekście jako `:pack/name:`; jeśli pakiet później zostanie usunięty, pokazuje się jako zwykły tekst. Naklejka zostaje na ekranie, gdy jej pakiet zniknie. Postać słyszy tylko "a sticker: name" i nigdy nie widzi obrazka. Postacie używają tylko pakietów, które dla nich włączysz w Profiles, Writing manner (patrz [[profiles]]). W nowym temacie na forum oferowane są tylko własne emoji, bo naklejka to cała odpowiedź.

## Gdzie jest postać

Gdy "Tell the character where it is" jest włączone (Settings > Messenger, domyślnie wyłączone), odpowiedź mówi, gdzie postać jest teraz w City i kto jest z nią: jedna linijka, około 30 tokenów. Czat pokazuje też zdjęcie tego miejsca za wiadomościami, gdy miejsce je ma. Patrz [[city]].

## Pokoje

"Room" w grupie Clubs powstał po "Walk in" w City (patrz [[city]]): klub postaci z jednego miejsca, ze zdjęciem miejsca za rozmową, gdy je ma. Kończy się z trzygodzinnym przedziałem albo wtedy, gdy naciśniesz "Leave the room".

## Historie

Gdy postać publikuje historię, nad listą kontaktów pojawia się rząd okrągłych zdjęć. Pierścień wokół zdjęcia znaczy, że nie widziałeś wszystkich historii tej postaci. Dotknij jednej, żeby ją otworzyć: zdjęcie (albo linia na kolorowej karcie, gdy nie ma zdjęcia), ile czasu zostało i strzałki, żeby przechodzić między historiami tej postaci. Historia znika po 24 godzinach (wtedy trafia do dziennika autora, patrz [[journal]]); "Remove" usuwa ją wcześniej, po pytaniu, i wtedy nie jest zapisywana.

Historia powstaje z własnego dziennika postaci z tego dnia, więc mówi coś, co naprawdę się jej przydarzyło. Historie są domyślnie wyłączone ("Settings" > "Community" > "Stories"); wymagają włączonego "Characters have their own life". Przy włączonym "Characters may send pictures" historia ma też zdjęcie, co kosztuje wywołanie modelu i wywołanie generowania obrazu.

## Kluby

Klub to jeden czat dla trzech lub czterech postaci wokół zainteresowania, na przykład grzybów albo starej muzyki. Rozmawiają ze sobą, a ty możesz się przyłączyć i też pisać. Kluby są wyłączone, dopóki nie włączysz ich w "Settings" > "Community" > "Clubs" (każda wiadomość to jedno wywołanie modelu, więc kosztuje tokeny, a darmowy model może mieć z tym kłopot).

Na górze listy kontaktów jest grupa **Clubs** z wierszem na każdy klub: awatary członków, nazwa, ostatnia linia i znacznik "Off", gdy klub jest wyłączony. Gdy kluby są wyłączone i nie masz żadnego, grupa jest zwinięta do tytułu: otwórz ją, żeby zobaczyć, czym jest klub, i przycisk, który prowadzi do ustawień. **New club** otwiera okno z nazwą, zainteresowaniem (opcjonalnym) i członkami: pisz w polu wyszukiwania, żeby znaleźć postać, i zaznacz trzy lub cztery. "Create club" działa, gdy nazwa jest wpisana, a licznik pokazuje 3 do 4. Może być najwyżej trzy kluby.

Otwórz klub, żeby przeczytać jego dziennik: każda linia ma awatar, imię i godzinę nadawcy, a twoje linie są oznaczone "You" (z "as <persona>", gdy masz więcej niż jedną personę). Pisz w polu pod dziennikiem. Gdy członkowie są w pobliżu, jeden odpowiada ci od razu, a inny może dołączyć minutę później; potem rozmawiają między sobą. Członkowie piszą tylko wtedy, gdy są online albo away według swojego harmonogramu, nigdy dwa razy z rzędu, z przerwą kilku minut, i najwyżej tyle wiadomości dziennie, ile ustawisz w Settings. Odpowiedzi na twoje wiadomości są osobne: przychodzą ponad to, do "Answers to you, per club" dziennie w każdym klubie (domyślnie 20; 0 oznacza, że członkowie nigdy ci nie odpowiadają i rozmawiają tylko między sobą). Gdy odpowiedzi na dziś się skończą, klub mówi o tym pod twoją wiadomością: członkowie odpowiedzą ponownie jutro, albo szybciej, jeśli podniesiesz limit w Settings. W nagłówku **Active** włącza lub wyłącza klub, a ołówek otwiera **Edit club**: zmienisz nazwę, zainteresowanie lub członków (tym samym wyborem), albo usuniesz klub razem z wszystkim, co w nim powiedziano, po pytaniu. Na komputerze prawa kolumna pokazuje członków i to, kto jest w pobliżu.

Członkowie zachowują swoją rolę i ton, który wybrałeś w Settings, "Romantic tone"; klub wie, co każdy z nich pamięta o innych, więc przyjaciele i rywale rozmawiają jak przyjaciele i rywale. Ich karty nigdy nie są czytane. Moderator może sam założyć klub, gdy trzy postacie mają wspólne zainteresowanie (wyłączysz to przełącznikiem "The Moderator starts clubs"): najwyżej jeden na trzy dni, nigdy więcej niż trzy kluby; możesz go przemianować, zmienić albo usunąć, a klub, który usuniesz, nie jest proponowany ponownie przez dwa tygodnie. Gdy postać zostaje usunięta, odchodzi ze swoich klubów, a klub, w którym zostaje mniej niż trzech członków, sam się wyłącza. W klubach nie ma zdjęć ani naklejek.

## Characters talk

Pod listą kontaktów, gdy "Characters talk to each other" jest włączone w "Settings" > "Community", jest wiersz "Characters talk". Otwiera on okno, w którym wybierasz dwie postacie i naciskasz "Let them talk". Każda para ma przełącznik (rozmawiają albo wstrzymane), "Read", żeby zobaczyć, co napisali, i "Remove".

Para pisze od czasu do czasu, tylko gdy obie są w pobliżu według swoich harmonogramów, do dziennej liczby, którą ustawiasz, po jednej wiadomości naraz. Podążają za tym, co każde pamięta o drugim, łącznie z napięciem między nimi. Ty tylko czytasz; nie piszą do ciebie w tej rozmowie. Kosztuje to około dwa razy więcej tokenów niż zwykły czat, więc jest domyślnie wyłączone, a darmowe modele mogą mieć z tym kłopot.

## Zdjęcia

Obok przycisku emoji w polu wiadomości jest przycisk zdjęcia. Otwiera on "Add a picture": **Upload from disk** (PNG, JPEG, WebP lub GIF, do 10 MB; duże zdjęcia są zmniejszane do 768 px) albo opisz zdjęcie i naciśnij **Draw**, żeby twój model graficzny je narysował (używa on twojego dostawcy obrazów i może kosztować tyle, ile pobiera dostawca; wybierz model w oknie, a jeśli nie wybierzesz, używany jest domyślny model aplikacji). Naciśnij **Attach**: mały znacznik pokazuje zdjęcie nad polem, z krzyżykiem do usunięcia. Wiadomość może być samym zdjęciem. Zdjęcie, które wysyłasz, zostaje w Social: postać jest informowana tylko, że wysłałeś zdjęcie (i jego opis, gdy je narysowałeś), nigdy samego zdjęcia, więc działa to z modelami obsługującymi tylko tekst.

Postacie też mogą wysyłać zdjęcia, ale tylko jeśli włączysz to w Settings, Pictures (domyślnie wyłączone, patrz [[settings]]). Postać wtedy od czasu do czasu wkłada zdjęcie do wiadomości, gdy pasuje, najwyżej tyle razy dziennie, ile ustawisz. Gdy jest rysowane, wiadomość pokazuje miejsce na zdjęcie; zdjęcie pojawia się, gdy jest gotowe, a mała etykieta "Drawn" oznacza zdjęcia zrobione przez model. Zdjęcia postaci rysuje strona Social, więc pojawiają się, gdy Social jest otwarte (zdjęcie zamówione, gdy było zamknięte, jest rysowane przy następnym otwarciu). Jeśli rysowanie się nie uda, wiadomość o tym mówi i nie ponawia się próby.

## Gdy lista jest pusta

Kontakty to postacie, które importujesz w Profiles. Bez nich Messenger pokazuje "No profiles yet" i przycisk, który otwiera Profiles. Patrz [[profiles]].
