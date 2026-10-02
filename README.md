# VerboVerde 🌿

Página para estudiar y practicar los verbos irregulares en inglés del **Libro 1 (Libro Verde)**: tabla de estudio, flashcards, ejercicios y seguimiento de progreso. Solo usa HTML, CSS y JavaScript, sin instalar nada.

## Estructura

```
index.html        → página principal
css/styles.css    → estilos (colores en :root)
js/verbos.js      → lista de verbos (edítala aquí)
js/app.js         → lógica de la app
favicon.svg       → ícono
```

## Probarla en tu computadora

Abre `index.html` con doble clic en el navegador.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `verboverde`), público.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio (botón **Add file → Upload files**, arrastra todo y da **Commit changes**).
3. Entra a **Settings → Pages**.
4. En **Build and deployment → Source**, elige **Deploy from a branch**.
5. En **Branch**, selecciona `main` y la carpeta `/ (root)`, y da **Save**.
6. Espera uno o dos minutos. Tu página quedará en:
   `https://TU-USUARIO.github.io/verboverde/`

## Notas

- El progreso se guarda en `localStorage`: se queda en ese navegador y dispositivo.
- La pronunciación usa la voz del navegador (Web Speech API). Chrome, Edge y Safari la soportan.
- Para agregar o corregir verbos, edita `js/verbos.js`. Si un verbo tiene variantes, sepáralas con `/` (por ejemplo `"burned/burnt"`).
