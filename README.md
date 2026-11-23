# Ferdaboka

Ei kartbok for turene dine, i Ringenes herre-stil. Du tegner turene rett på kartet med musa, skriver en beskrivelse og legger ved bilder.

## Installere (Windows)

1. Kjør `Ferdaboka-Setup-1.0.0.exe`.
2. Windows SmartScreen kan vise «Windows beskyttet PC-en» fordi installasjonsfilen ikke er signert. Velg **Mer informasjon** og deretter **Kjør likevel**.
3. Etter installasjonen ligger **Ferdaboka** på skrivebordet og i Start-menyen.

Appen installeres bare for din bruker og trenger ikke administratorrettigheter. Du avinstallerer den under *Innstillinger → Apper*.

## Oppdateringer

Appen ser etter nye versjoner på GitHub (github.com/jodoa002/ferdaboka/releases) når den starter og hver sjette time. Finner den en ny versjon, lastes den ned i bakgrunnen, og du får et varsel med knappen **Start på nytt og oppdater**. Velger du **Senere**, installeres oppdateringen neste gang du lukker appen. Turene og bildene dine berøres ikke.

Du kan også trykke **Se etter oppdateringer** nederst i startmenyen.

## Bruk

| Handling | Slik gjør du det |
|---|---|
| Tegne en ny tur | **+ Ny tur**, eller velg **Tegn** (tast B) og tegn rett på kartet |
| Flytte kartet | Dra med **Flytt** (V), eller høyreklikk og dra i alle verktøy, eller hold mellomrom og dra |
| Zoome | Musehjulet, eller + / − / 0 |
| Viske ut deler av en tur | Velg turen, så **Visk** (E), og dra over streken |
| Angre / gjøre om | Ctrl+Z / Ctrl+Y |
| Velge en tur | Klikk på streken på kartet eller i lista |
| Bilder | Åpne turen og trykk **+ Legg til bilder**. Klikk på et bilde for å se det i stort format |
| Eget kart | **Legg til nytt kart** i startmenyen. Bruk så **Målestokk** for å få lengder i km: klikk to punkter og skriv inn avstanden |

Målestokken på Trondheim-kartet er omtrentlig. Du kan justere den med **Målestokk**-verktøyet, for eksempel mellom to steder der du kjenner den eksakte avstanden.

## Data

Turer, egne kart og bilder lagres i `%APPDATA%\Ferdaboka`. Bildene kopieres dit, så originalene kan flyttes eller slettes. Lenken **Åpne datamappe** i startmenyen åpner mappa. Ta kopi av den hvis du vil ha sikkerhetskopi. Mappa beholdes når appen avinstalleres.

## Utvikling

```bash
npm install
npm start                 # kjør appen
npm run map               # generer Trondheim-kartet på nytt (krever rsvg-convert og ImageMagick)
npm run dist              # bygg Windows-installer + latest.yml (krever NSIS / makensis)
npm run release           # viser lenken til «Bygg og publiser» (GitHub Actions bygger og publiserer)
```

- `tools/generate-map.js` tegner kartet. Geografien er sporet omtrentlig, med ca. 23 m per enhet.
- Fonter: Uncial Antiqua og IM FELL English (SIL Open Font License).
