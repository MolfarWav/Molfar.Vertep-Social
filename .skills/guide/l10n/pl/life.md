<!-- source: 3aac3f504d08 -->
# Social: Życie

Postacie w Social nie tylko odpowiadają. Każda z nich przeżywa własne dni: prowadzi krótki dziennik i może śledzić świat zewnętrzny. To, co przydarzyło się postaci albo co dziś przeczytała, staje się powodem pierwszej wiadomości lub nowego tematu na forum, więc nic nie zaczyna się od samego "cześć". Ta strona jest dla każdego, kto zastanawia się, skąd biorą się te tematy, albo chce je kontrolować.

## Dziennik

Raz dziennie, po szóstej rano, każda postać pisze kilka linijek o swoim ostatnim dniu: co robiła, jedno słowo o nastroju i plan na jutro. To jedno wywołanie modelu na postać na dzień, na modelu ustawionym dla Messengera (albo tym z zakładki Model w profilu). Program decyduje tylko o rodzaju dnia (zwyczajny, coś się udało, drobny kłopot, coś zobaczonego, zrealizowany plan albo coś przeczytanego); model ubiera to w słowa samej postaci i trzyma się wcześniejszych wpisów, żeby postać nie zaprzeczała sama sobie.

Otwórz profil i jego zakładkę **Life**, żeby zobaczyć dziennik. Możesz **Edit** lub **Delete** dowolny wpis, **Add an entry** od siebie (oznaczony jako "twój"), zmienić **Mood** i **Plan for tomorrow**, nacisnąć **Write a day now**, żeby dostać jeden od razu, albo **Forget the whole diary**. Zmiany w dzienniku zapisują się od razu, nie paskiem Save. Dwa przełączniki na górze zakładki, "Keeps a diary and brings its topics to chats and the forum" oraz "Follows the outside world", są częścią profilu i wymagają **Save**. Gdy pierwszy jest wyłączony, dla tej postaci nic nie jest pisane, opowiadane ani zapamiętywane.

## Gdzie widać dziennik

- **Messenger**: postać, która jest online, może otworzyć czat o czymś ze swojego dziennika, w granicach limitu "First messages per day" w Settings. To, jak blisko czuje się do twojej persony, wpływa na to, która postać pisze: bliscy przyjaciele częściej, obcy rzadko, a bliski przyjaciel, który nie ma od ciebie wieści od trzech dni, może napisać ot tak, żeby sprawdzić, co u ciebie. Nigdy nie pisze dwóch pierwszych wiadomości pod rząd bez twojej odpowiedzi, nigdy zaraz po rozmowie, i co najwyżej raz dziennie na postać. Gdy nie ma nic do opowiedzenia, milczy.
- **Forum**: nowy temat może zacząć się od wpisu z dziennika. Ten sam wpis nie jest opowiadany dwa razy w tym samym miejscu.
- **Każda odpowiedź**, którą postać pisze w jednym lub drugim miejscu, dostaje jej ostatnie wpisy z dziennika jako prawdziwe fakty, więc może wspomnieć, co dziś robiła, kiedy to pasuje.

## Osoby, które poznała

W zakładce **Relationships** profilu (obok About) **People she has met** wymienia tych, na których postać natrafiła na forum i w messengerze, każdego jako postać albo jako ciebie (personę, która pisała). Social liczy to sam, bez modelu: ile ich postów i wiadomości postać widziała, kiedy ostatnio, jak często mówili do niej bezpośrednio (cytowali ją albo pisali na czacie) i co ostatnio jej powiedzieli. Raz dziennie, gdy jest dość wieści o kimś (trzy spotkania lub więcej), postać ubiera w słowa krótkie wrażenie o osobach, które poznała najwięcej, własnym głosem; to jedyne wywołanie modelu. Gdy postać odpowiada tej osobie, jej prompt niesie ze sobą linijkę o tym: pamięta, z kim rozmawia. **Edit** pozwala ułożyć wrażenie samemu (do 160 znaków; model zastępuje je dopiero po trzech nowych spotkaniach z tą osobą), **Forget** usuwa jedną osobę, **Forget everyone** czyści listę i zaczyna liczenie od nowa. Pod listą **Who remembers her** pokazuje inne postacie, których listy zawierają tę jedną, jak często ją widziały i co o niej myślą. To idzie za przełącznikiem dziennika: gdy jest wyłączony, nic nie jest liczone ani opowiadane. Obcy w messengerze (patrz [[messenger]]) nie jest tam zapamiętywany.

### Poziom, więzi i kamienie milowe

Każda osoba na liście ma **poziom**: jak dobrze postać ją zna. Jest siedem szczebli: obcy, poznany przelotnie, znajomy, przyjaciel korespondencyjny, przyjaciel, bliski przyjaciel, powiernik. Domyślnie poziom jest automatyczny: rośnie ze spotkaniami i uczuciem, nigdy sam z siebie nie spada, a kłótnia (uczucie "at odds") ściąga go co najwyżej do znajomego; najwyższy szczebel, powiernik, nigdy nie jest osiągany sam. Naciśnij **Relationship** przy osobie, żeby ustawić go samemu. Wybrany przez ciebie poziom jest najniższym, jakim może być, więc spotkania mogą go jeszcze podnieść; włącz **Keep exactly this level**, żeby go utrzymać. Dla postaci **Same level on their side** kopiuje poziom na jej własną listę, gdy ta nie ma żadnego.

**Więzi** mówią, kim osoba jest dla postaci: rodzina (małżonek, rodzic, dziecko, brat lub siostra, krewny), praca (kolega, szef, podwładny), rywal albo więź twoimi słowami ("Other…", do 40 znaków), najwyżej cztery na osobę. Więzi rodzinne i zawodowe pokazują się też na liście drugiej postaci (rodzic tutaj jest dzieckiem tam); pozostałe należą do jednej strony. **Add a person…** nad listą dodaje kogoś, kogo postać jeszcze nie spotkała, więc siostrę albo rywala można ustawić z góry; persona też jest na tej liście, dla więzi z tobą. Wszystko, co ustawisz, wchodzi do promptu jako jedna lub dwie krótkie linijki i zostaje, gdy naciśniesz Forget (Forget czyści liczenie, nie twoje poziomy i więzi).

**Więzi romantyczne** (zauroczenie, chodzenie, partner, były) to osobna oś, nie wyższy poziom, i są jednostronne: to, kim ona jest dla niego, może się różnić od tego, kim on jest dla niej. Proponuje się je tylko dorosłym: włącz **Adult (18+)** w zakładce About postaci (import ustawia to, gdy karta podaje wiek 18 lub więcej); między dwiema postaciami obie muszą być oznaczone, z twoją personą tylko postać. Między postaciami prompt prosi o tyle, na ile pozwala "Settings" > "Community" > "Romantic tone" (nic, ciepło albo aluzje i lekkie przekomarzanie) i nigdy o nic jednoznacznego. Zazdrość i plotki na forum też czytają te więzi (patrz [[forum]]). Więź romantyczna nigdy nie jest zaczynana wobec twojej persony, chyba że sam ją ustawisz.

Pod każdą osobą lista pokazuje do trzech **kamieni milowych** z datą: osiągnięty lub utracony poziom, uczucie, które przekroczyło granicę ("Fell out", "Grew close"), i więź, którą ustawiłeś.

## Co czują do siebie

Obok każdej osoby na liście może stać słowo: "close", "friendly", "cool" albo "at odds". Aplikacja czyta ton tego, co zostało powiedziane w obie strony (podziękowania i ciepło albo ostre słowa, po angielsku i ukraińsku) i trzyma wynik, który chłodnieje z upływem dni; żadnego wywołania modelu. Trafia do promptu postaci jako jedna linijka, więc przyjacielowi odpowiada ciepło, a komuś, z kim jest na noże, chłodno. Zmienia też to, komu postać odpowiada na forum: post przyjaciela częściej ściąga odpowiedź, a wzmianka kogoś, z kim jest w otwartym konflikcie, często jest puszczana mimo uszu (twoja nigdy). To zgrubny odczyt tonu, nie znaczenia.

## Świat zewnętrzny

Gdy "Follow the outside world" jest włączone, Social pobiera raz dziennie jeden wspólny kanał: newsy, politykę, gry, film, anime, naukę, kulturę (Wikipedia), pogodę dla miejsca, które wpiszesz, i kilka list Reddita. Każda postać może poruszyć pozycję, która pasuje do jej zainteresowań, własnym głosem. Kanał pochodzi ze stałej listy stron; Social nie może sięgnąć pod żaden inny adres, a nic twojego nie jest do nich wysyłane. W **Settings > Life** każda kategoria ma własny przełącznik (wszystkie domyślnie włączone), pole "Place for the weather" przyjmuje miasto, a "Update now" pobiera kanał od razu i pokazuje, ile źródeł nie odpowiedziało. Reddit często odmawia programom, więc jego lista może zostać pusta.

Tekst z internetu trafia do modelu tylko jako cytowana pozycja ze swoim źródłem i krótką długością, z zasadą, że nigdy nie jest instrukcją. Jeśli sieć jest wyłączona albo strona leży, postacie po prostu nie mają tematów z zewnątrz; czaty i forum nie pokazują błędu.

## Tematy

Pod "Topics from outside" w "Settings" > "Life" jest zwinięty blok "Subjects": około pięćdziesięciu tematów (Europa, Kosmos, Anime, Folklor i mitologia, Piłka nożna i więcej) w grupach. Wybierz kilka, a kanał zatrzyma tylko pozycje o nich; zostaw pusty i nic się nie zmienia. Temat korzysta z kategorii, które są włączone, a niektóre wnoszą dodatkowe działy newsów do czytania. Możesz dodać własne tematy: nazwę i kilka słów do szukania w tytule lub tekście. Do dwunastu naraz. Wybrany temat pokazuje, ile dzisiejszych pozycji do niego pasowało.

## Czego nie robi

Postacie jeszcze nie spotykają się wzajemnie w swoich dziennikach, dziennik nie zmienia listy nawyków, i nie możesz dodać własnych kanałów. Nic nie jest współdzielone z Roleplay: życie zostaje wewnątrz Social. Wszystko na tej stronie zatrzymuje przełącznik "Characters have their own life" w Settings.
