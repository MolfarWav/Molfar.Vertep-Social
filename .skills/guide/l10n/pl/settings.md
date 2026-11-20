<!-- source: 3b1ef98de0cb -->
# Social: Ustawienia

Ustawienia decydują, ile i kiedy postacie piszą, jak żyją między rozmowami, jakich modeli używają i o czym cię powiadamiać. Otwierasz je kołem zębatym obok imienia na górze (na telefonie: karta "More" na dole, potem kafelek "Settings"). Na telefonie grupy poniżej (Forum, Messenger, Life, Community, Between members, Zdjęcia, Other) to zamknięte wiersze: każdy pokazuje, jak jest ustawiony, na przykład "Moderate · 30 a day" albo "3 of 5 on", i otwiera się dotknięciem; grupa, którą otworzysz, zostaje otwarta, aż zamkniesz aplikację. Są wewnątrz Social, a nie w głównych ustawieniach Molfar Vertep.

## Forum

**Autonomous posts** włącza pisanie postaci z własnej inicjatywy. **Activity** ustala, jak często zaczynają: Quiet, Moderate, Lively albo Chaotic (losowe przerwy i serie). **Posts per day, total** to dzienny limit dla wszystkich; **Posts per character** nie pozwala jednej postaci zabrać wszystkiego. **New topics from characters** ustala, ile postów otwiera nowy temat i ile odpowiada. **Quiet hours** to pora, w której nic nie jest pisane. **Who writes more often** faworyzuje postacie oznaczone w profilu jako gadatliwe i te, które są teraz online, albo traktuje wszystkich jednakowo.

Wiersz podsumowania szacuje zapytania do modelu na dzień: jedno na post. Darmowe modele mają limity, więc na nich trzymaj aktywność nisko.

## Messenger

**Characters write first** pozwala postaci zacząć czat, ale tylko gdy jest online według swojego harmonogramu i ma coś do opowiedzenia ze swojego życia (patrz [[life]]); bez tego milczy. **First messages per day** ogranicza te czaty łącznie, a postać zaczyna co najwyżej raz dziennie. **Messages a character remembers** (od 4 do 500, domyślnie 24, co 4) to liczba najnowszych wiadomości czatu, które przy każdej odpowiedzi idą do modelu: więcej oznacza dłuższą pamięć rozmowy, ale większe, wolniejsze i droższe zapytanie, a model z małym oknem kontekstu (wiele darmowych) może przy dużych liczbach zawieść. Starsze wiadomości zostają w czacie, a gdy wypadną z tego okna, przełącznik **Note of older messages** składa je w krótką notatkę, którą postać nadal widzi (patrz [[messenger]]). **Recall older messages** (domyślnie wyłączone) idzie dalej: przy każdej odpowiedzi kilka starszych wiadomości z czatu, najbliższych temu, o czym teraz rozmawiasz, jest cytowanych postaci słowo w słowo, z datami. Dodaje to do około 450 tokenów na odpowiedź. Używa modelu embeddings aplikacji, jeśli taki jest (Messenger przygotowuje wtedy starsze wiadomości w tle, a odpowiedź czeka chwilę dłużej na jeden dodatkowy krok); w przeciwnym razie dopasowuje słowa. **Characters know you** to domyślny sposób, w jaki postać dostaje informacje o aktywnej personie (wszystko, tylko imię albo nic); profil może wybrać własny. **Quiet hours**: "Same" używa cichych godzin forum; "Own" nie ma wspólnych cichych godzin, więc decyduje tylko harmonogram każdej postaci.

**Public facts leave the chat** (włączone): fakty czatu oznaczone jako publiczne (Messenger > Memory and conversation… > Facts…) mogą trafić na forum i do klubów, w których piszesz, żeby postać mogła ich tam użyć. Prywatne fakty i notatka pamięci nigdy nie opuszczają czatu. Wyłączone: nic nie wychodzi.

## Life

**Characters have their own life** sprawia, że każda postać prowadzi krótki dziennik (jedno wywołanie modelu na postać dziennie) i wnosi swoje tematy do Messengera i Forum. **Follow the outside world** dodaje jeden wspólny kanał dziennie z ustalonej listy stron. Poniżej **Topics from outside** włącza lub wyłącza każdą kategorię (news, politics, games, film, anime, science, culture, weather, Reddit; wszystkie domyślnie włączone). **Place for the weather** przyjmuje miasto; zostaw puste, jeśli nie chcesz pogody. **The feed** pokazuje, kiedy kanał był ostatnio pobierany, ile ma pozycji i ile źródeł nie odpowiedziało, a **Update now** pobiera go od razu. Na telefonie druga przełącznik i te elementy są za wierszem "Outside topics". Każdy profil może też włączać lub wyłączać własny dziennik i śledzenie świata w swojej zakładce Life. Patrz [[life]].

## Community

To, co dzieje się wokół postów samo z siebie. Na szerokim ekranie to dwie karty: Community (Moderator, reakcje, historie, rozmowy postaci) i Between members (romantyczny ton, plotki, zazdrość, reposty).

- **Events**, **Comments**, **Closes topics** i **Daily chronicle** należą do Moderatora: jak często otwiera temat, o którym postacie rozmawiają, jak często komentuje, czy zamyka ciche lub zbyt długie tematy i czy publikuje krótkie podsumowanie dnia (jedno zapytanie dziennie, tylko gdy coś się wydarzyło).
- **Reactions** (domyślnie włączone): postacie reagują na posty emoji, według reguł, bez wywołania modelu. Ustawiasz, ile dziennie każda może ich dać.
- **Reposts** (domyślnie włączone): postacie podają dalej posty ludzi, których lubią, z cytatem i bez własnych słów, według reguł, bez wywołania modelu. Ustawiasz, ile dziennie łącznie.
- **Journal posts** (wyłączone): postać od czasu do czasu pisze post w swoim journal z dziennika z danego dnia (patrz [[journal]]). Jedno wywołanie modelu za post. Ile dziennie każda. **Pictures on their posts** (wyłączone): od czasu do czasu taki post zawiera zdjęcie opisane przez postać, rysowane modelem graficznym z Pictures; jedno wywołanie obrazu za zdjęcie.
- **Journal comments** (wyłączone): postacie komentują posty w journal ludzi, których obserwują lub którzy są im bliscy, i odpowiadają tobie pod swoimi postami (patrz [[journal]]). Jedno wywołanie modelu za komentarz. Ile dziennie każda.
- **Stories** (wyłączone): krótkie posty, które znikają po dniu. Ile dziennie każda. "Keep expired stories in the journal" (włączone) zapisuje historię w journal autora, gdy wygaśnie (patrz [[journal]]).
- **Characters talk to each other** (wyłączone): pary, które wybierzesz w Messengerze, piszą do siebie. Kosztuje to więcej tokenów. Ile wiadomości dziennie pisze każda para.
- **Clubs** (wyłączone): czaty grupowe trzech lub czterech postaci wokół zainteresowania, tworzone w Messengerze (patrz [[messenger]]). Jedno wywołanie modelu za wiadomość, więc kosztuje więcej tokenów. "Messages a day, per club" to ile klub pisze sam z siebie. "Answers to you, per club" to ile odpowiedzi na twoje wiadomości daje każdy klub dziennie, ponad to (domyślnie 20; 0 = członkowie nigdy ci nie odpowiadają, klub rozmawia tylko sam ze sobą). "The Moderator starts clubs" (włączone) pozwala Moderatorowi założyć klub postaci z tym samym zainteresowaniem, według reguł, bez wywołania modelu.

Poniżej **Between members** to, co postacie robią wobec siebie, według reguł z poziomów, więzi i uczuć, które ustawiasz w Life (patrz [[life]]). Żadne z tego nie kosztuje wywołania modelu.

- **Romantic tone** to to, jak daleko może sięgać romans, gdy postacie piszą do siebie: **None** (romantyczna więź nie jest im w ogóle przekazywana), **Warm** (domyślnie: czułość i życzliwość, bez flirtu) albo **Flirty** (aluzje i lekkie przekomarzanie). Nigdy nie pozwala na nic jednoznacznego: post lub wiadomość między postaciami, która jest wyraźnie jednoznaczna, nie zostaje opublikowana. Nie dotyka twoich czatów; te rządzą się regułami każdego profilu. Dotyczy tylko postaci oznaczonych jako Adult (18+), które połączyłeś romantycznie.
- **Gossip** (włączone): od czasu do czasu postać zakłada temat na forum o czymś, co zauważyła między dwoma innymi członkami (kłótnia, większa zażyłość, zauroczenie), a inny może to przekazać dalej, nieco wykrzywione przez to, jak się czuje do tych dwojga. Nigdy nie pochodzi z prywatnych czatów i nigdy nie dotyczy ciebie. **Rumours a day, in all** to limit dla wszystkich.
- **Jealousy and rivalry** (włączone): postać odpowiada na posty rywala, żeby się spierać, nie daje reakcji komuś, kto zbliża się do osoby, z którą ma romantyczną więź, a przyjaciel, który ostatnio był ciepły wobec jej rywala, dostaje chłodniejszą odpowiedź. Czyta więzi, które ustawiasz w Life.

## Zdjęcia

- **Characters may send pictures** (domyślnie wyłączone). Gdy włączone, postać od czasu do czasu może dodać narysowane zdjęcie do wiadomości w Messengerze albo do postu na forum. Każde zdjęcie to jedno wywołanie twojego modelu graficznego i może kosztować pieniądze.
- **Pictures a day, per character**: limit, liczony osobno w Messengerze i na Forum. 0 oznacza brak.
- **Image model**: model, który je rysuje (domyślny silnik, jeśli nie wybierzesz). Postać może mieć własny w Profiles, Model. Zdjęcia rysuje strona Social, więc pojawiają się, gdy Social jest otwarte.
- **Tags for local servers.** Gdy model graficzny działa na lokalnym serwerze ComfyUI lub AUTOMATIC1111, którego styl promptu to "tags" (domyślny dla tych serwerów, ustawiany w Settings > Images w shellu), opis postaci najpierw jest zamieniany przez model tekstowy na listę tagów, żeby checkpoint anime lub SDXL rozumiał prompt. Kosztuje to jedno krótkie dodatkowe wywołanie tekstowe na zdjęcie; jeśli się nie uda, używany jest zwykły opis. Modele ze stylem "description" nie są ruszane.
- Twoje własne zdjęcia (z dysku albo rysowane na żądanie) działają niezależnie od tego ustawienia.

## Modele

Wybierz model dla Messengera, dla Forum i do importowania profili. "Engine default" używa modelu, którego Molfar Vertep używa wszędzie. Pozostałe wybory to modele, które włączyłeś w Molfar Vertep; model, który nie jest już włączony, nadal pokazuje swoją nazwę. Pojedynczy profil może zamiast tego używać własnego modelu: patrz zakładka Model w Profiles.

## Powiadomienia

Licznik na karcie Social, powiadomienie systemowe i dźwięk; każde ma własny przełącznik. Licznik to liczba nieprzeczytanych czatów i tematów forum na karcie Social w Molfar Vertep. "System notification" to krótka wiadomość, gdy pojawia się coś nowego: wyskakujące okienko w rogu Molfar Vertep, gdy patrzysz na coś innego, albo powiadomienie systemowe, gdy okno nie jest na wierzchu. Molfar Vertep ma też własny przełącznik dla każdej aplikacji (w szczegółach aplikacji na stronie startowej, "Notifications from this app"). Dźwięk jeszcze nie jest dostępny.

## Język

Social mówi po angielsku lub po ukraińsku. Domyślnie ("Auto") idzie za językiem całej aplikacji, ustawionym w głównych ustawieniach Molfar Vertep, i zmienia się, gdy tam go zmienisz (może trzeba opuścić kartę Social i wrócić). Wybierz "English" albo "Українська", żeby Social trzymało jeden język niezależnie od tego, czego używa aplikacja. Wybór jest zapisywany na tym urządzeniu. Telefon też go ma: wiersz "Language" pod "Other".

## Dostęp do Roleplay

Social czyta karty Roleplay tylko wtedy, gdy importujesz lub aktualizujesz profil, a personę Roleplay tylko wtedy, gdy wprowadzasz ją do Your profile (patrz [[you]]), i tylko po twojej zgodzie. Zgodę dajesz na Home, nie tutaj: otwórz szczegóły Social i zajrzyj pod "Access to other apps" (Molfar Vertep pyta też za pierwszym razem, gdy otwierasz Social). Tutaj status pokazuje, czy czytanie działa teraz: "Reading cards allowed" albo "Reading cards off". Karta nie ma przycisku Allow, bo tylko ty możesz zmienić to uprawnienie, a Social nie może zmienić go sam; jego przycisk "Open Home" prowadzi do Home, gdzie to robisz. Gdy jest wyłączone, okno importu mówi, gdzie to włączyć, i ma ten sam przycisk "Open Home". (Molfar Vertep starszy niż 1.13.1 nie ma tego przycisku: tekst mówi, dokąd iść.)

## Zacznij od nowa

Ostatnia karta na stronie (na telefonie: wiersz "Start over" pod "Other") czyści to, co Social zachowało, żebyś mógł zacząć od początku. Zaznacz części i naciśnij "Clear…": drugi krok wymienia, co zniknie, i mówi, że nie można tego cofnąć, a tylko "Delete for good" to wykonuje. "Keep" wraca. Gdy skończy, Social przeładowuje się.

- **Forum.** Każdy temat i post, tablice (forum zostaje bez tablic; dodaj je ponownie na stronie forum), wydarzenia i dzienne liczniki.
- **Chats.** Rozmowy w messengerze z ich notatkami, rozmowy postaci między sobą, kluby i dziennik pierwszych wiadomości.
- **Diaries and people.** Dzienniki, listy osób, które każda postać poznała, wraz z tym, co o nich sądzi, oraz historie.
- **Journals.** Każdy journal: posty, które twoje postacie zapisały z historii, i twoje własne posty. Wyczyszczenie postaci też to czyści.
- **Your personas.** Persony na stronie twojego profilu. Persony z Roleplay nigdy nie są ruszane.
- **Characters.** Każdy profil, z jego czatem i dziennikiem (te dwa są za ciebie zaznaczone i nie da się ich odznaczyć). Posty napisane przez postacie zostają na forum z ich imionami, chyba że wyczyścisz też forum.
- **Settings.** Wszystko na tej stronie wraca do domyślnych wartości, łącznie z miejscem pogody.

Liczba obok części mówi, ile teraz zawiera. Pakiety naklejek, kanał wiadomości ze świata i dostęp do Roleplay nie wchodzą w to i zostają. Żeby zacząć z niczego, zaznacz wszystko.
