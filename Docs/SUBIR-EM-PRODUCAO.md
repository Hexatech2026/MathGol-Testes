# Subir o MathGol em produção

Passo a passo da versão de fechamento (v2.3, 04/11/2026). O pacote é um
site estático: não tem build, não tem variável de ambiente.

> **A ordem importa.** As regras do Firestore vêm primeiro. O site novo
> grava dois campos que as regras antigas não conhecem (`pausada` e
> `expiraEm`) e usa uma coleção nova (`partidas`). Subir o site antes das
> regras deixa a pausa da sala e o duelo online sem funcionar.

## 1. Regras do Firestore (antes de tudo)

Console do Firebase → projeto **math-gol** → **Firestore Database →
Regras**. Apague o que está lá, cole o conteúdo de
[`Config/firestore.rules`](../Config/firestore.rules) e publique.

Pelo terminal dá no mesmo:

```bash
npx firebase deploy --only firestore:rules --project math-gol
```

Confira que o bloco das salas começa assim:

```
match /salas/{codigo} {
  allow get: if autenticado();
  allow list: if false;
```

e que existe um bloco `match /partidas/{codigo}`.

## 2. Authentication

Console → **Authentication → Método de login**:

- **Anônimo** → ativado (é como toda criança entra).
- **E-mail/senha** → ativado (é o que faz o código do craque funcionar).

Console → **Authentication → Configurações → Domínios autorizados**:
o domínio de produção precisa estar na lista, senão o login falha ali.

## 3. Prazos de retenção (HU-20)

**Nada a fazer no Console.** O TTL do Firestore exige o plano Blaze, e o
projeto está no Spark — a tela devolve `403: Project math-gol has billing
disabled`. A limpeza é feita por um script da equipe:

```bash
npm run limpar            # mostra o que venceu
npm run limpar -- --apagar
```

Uma vez por mês basta. Ele apaga salas com mais de 30 dias, duelos com
mais de 24 h e perfis com 12 meses sem acesso — junto com as subcoleções,
que o TTL não apagaria nem no Blaze. Prazos, ressalvas e o registro de
quem rodou em [`POLITICA-DE-DADOS.md`](POLITICA-DE-DADOS.md).

## 4. Subir os arquivos

Descompacte o `.zip` na raiz do repositório de produção, substituindo o
que existe, e faça o commit. A estrutura precisa ficar assim na raiz:

```
index.html   Audio/   CSS/   Config/   Docs/   Fontes/
HTML/        Imagens/ JS/    Vendor/   firebase.json   vercel.json
```

**Vercel:** importar o repositório com o preset "Other". O `vercel.json`
faz `/` servir `HTML/index.html`.

**GitHub Pages:** Settings → Pages → Deploy from branch → `main` / `/ (root)`.
O `index.html` da raiz redireciona com link relativo.

A pasta `Vendor/` (4 MB) é parte do site: é dela que saem o Three.js e as
bibliotecas de Excel e PDF. Sem ela o jogo cai no modo simplificado 2D.

## 5. Conferir depois do deploy

A lista abaixo é a do relatório de QA da Sprint 5 mais o que esta sprint
entregou. Dá para fazer em cerca de 10 minutos.

- [ ] A página abre e o menu aparece.
- [ ] `/#professor` abre direto a Sala do Professor (HASH-01).
- [ ] `/#entrar` abre a tela de entrar na sala (HASH-02).
- [ ] `/#PROFESSOR` em maiúsculas faz o mesmo (HASH-03).
- [ ] `/#nada` não muda a tela (HASH-04).
- [ ] Uma partida abre em 3D, sem o aviso "Modo simplificado".
- [ ] Na tela de times as bandeiras aparecem.
- [ ] O texto está em Fredoka e Atkinson, não na fonte do sistema.
- [ ] Criar o código do craque funciona e entra em outro aparelho.
- [ ] Professor cria sala, troca o nível e **pausa**: a tela de pausa
      aparece no aparelho do aluno.
- [ ] Duelo online: um cria, o outro entra com o código de 4 dígitos, e o
      placar dos dois sobe ao vivo.
- [ ] Baixar Excel e PDF da turma.

Com o DevTools aberto, na aba Rede, o único domínio externo que deve
aparecer é `www.gstatic.com` (SDK do Firebase).

## 6. Limpar os dados de teste

Os testes de 04/11/2026 deixaram salas e contas no projeto. Antes de
abrir para a turma, apague pelo Console:

- salas `RSH-F6C`, `9XM-7HV`, `RSC-HVP`, `4FG-4FF`, `U22-9Z5`, `VPJ-5YD`,
  `NRJ-67P` e as de nome "Verificação regras" / "HU15";
- a coleção antiga `codigos` e os documentos `jogadores/{token}` do
  modelo anterior ao login anônimo;
- em Authentication, as contas anônimas e `craque.*` de teste.

## 7. Se precisar voltar atrás

O site é estático: reverter o commit do repositório de produção já
desfaz. As regras do Firestore têm histórico próprio no Console
(Firestore → Regras → histórico), e dá para republicar a versão
anterior por ali.
