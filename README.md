# Line Halftone SVG Generator

Ferramenta de producao para converter imagens em SVG no estilo line halftone / barcode portrait, com:

- linhas paralelas
- espessura variavel
- controle de angulo
- dimensoes fisicas confiaveis em mm
- SVG exportado com `path` fechado e preenchido
- suporte para preview com fundo separado do fundo real do SVG
- motor reutilizavel fora do front-end
- API local pronta para automacao e n8n

## Estrutura

```text
core/
  line-halftone.js           # motor puro e reutilizavel
server/
  app.js                     # camada HTTP/API
  index.js                   # bootstrap do servidor
  services/
    svg-generation-service.js
src/
  App.jsx                    # interface web
tests/
  api.test.js
  generator.test.js
  fixtures/
    example-input.png
```

## Como funciona hoje

O motor gera linhas paralelas dentro de uma area em mm, amostra a imagem ao longo de cada linha, converte luminosidade em espessura local e fecha o contorno como poligono preenchido. O resultado final e um SVG pronto para uso em slicers como o PrusaSlicer.

## Rodando localmente

Instale dependencias:

```bash
npm install
```

Suba a interface web:

```bash
npm run dev
```

Suba a API local:

```bash
npm run api
```

Execute os testes:

```bash
npm test
```

Build do front:

```bash
npm run build
```

## Endpoints

### `GET /health`

Resposta:

```json
{
  "status": "ok",
  "service": "line-halftone-generator"
}
```

### `POST /generate-svg`

Formato: `multipart/form-data`

Campo de upload:

- `image`: arquivo de imagem

Campos aceitos:

- `widthMm`
- `heightMm`
- `unit`
- `angleDeg`
- `lineSpacingMm`
- `minThicknessMm`
- `maxThicknessMm`
- `intensity`
- `brightness`
- `contrast`
- `minBrightness`
- `maxBrightness`
- `gamma`
- `samplingMm`
- `smoothing`
- `marginMm`
- `simplifyMm`
- `invert`
- `transparentSvg`
- `svgBackground`
- `previewBackground`

O endpoint retorna o SVG diretamente com `Content-Type: image/svg+xml`.

## Exemplo com curl

```bash
curl -X POST "http://localhost:3001/generate-svg" \
  -F "image=@tests/fixtures/example-input.png" \
  -F "widthMm=120" \
  -F "heightMm=120" \
  -F "angleDeg=90" \
  -F "lineSpacingMm=1.6" \
  -F "minThicknessMm=0.3" \
  -F "maxThicknessMm=2.4" \
  -F "contrast=10" \
  -F "marginMm=3" \
  -F "transparentSvg=true" \
  --output output.svg
```

## Exemplo de integracao no n8n

No node `HTTP Request`:

- Method: `POST`
- URL: `http://host.docker.internal:3001/generate-svg`
- Send Body: `Form-Data`
- Form field `image`: tipo `File`
- Outros campos: tipo `Text`

Campos recomendados:

- `widthMm`: `120`
- `heightMm`: `120`
- `angleDeg`: `90`
- `lineSpacingMm`: `1.6`
- `minThicknessMm`: `0.3`
- `maxThicknessMm`: `2.4`
- `contrast`: `10`
- `marginMm`: `3`
- `transparentSvg`: `true`

Se quiser salvar o retorno como arquivo no n8n:

- Response Format: `File`
- Binary Property: `data`

Fluxo simples no n8n:

1. `Webhook` ou `Read Binary File`
2. `HTTP Request` para `/generate-svg`
3. `Write Binary File` ou envio para outro sistema

## Fluxo completo

### Browser

1. O usuario sobe uma imagem pela interface web.
2. O front converte a imagem em RGBA via canvas.
3. O front chama o motor compartilhado.
4. O SVG aparece no preview e pode ser baixado.

### API / automacao

1. Um cliente envia `multipart/form-data` para `/generate-svg`.
2. A API faz decode da imagem com `sharp`.
3. A camada de servico chama o motor compartilhado.
4. O SVG final retorna pronto para salvar, encadear no n8n ou enviar para outro sistema.

## Validacao coberta

- SVG valido que o `sharp` consegue ler
- dimensoes em mm
- paths fechados e preenchidos
- erro para arquivo invalido
- fixture reproduzivel em `tests/fixtures/example-input.png`

## Observacoes

- A interface continua local e independente da API.
- O motor reutilizavel fica em `core/line-halftone.js`.
- `previewBackground` e um parametro de interface. Ele nao altera o fundo real do SVG exportado.
- O projeto ainda contem uma copia aninhada antiga em `polar-halftone-ui/polar-halftone-ui`. Ela nao participa da nova arquitetura.
