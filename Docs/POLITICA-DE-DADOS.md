# Política de dados do MathGol (HU-20)

> **Status: proposta, aguardando validação do Product Owner.**
> Os prazos abaixo foram escolhidos pela equipe de desenvolvimento como
> ponto de partida. O CA-20.8 pede que quem responde pelo projeto valide e
> registre a data. Enquanto isso não acontece, a HU-20 fica como "aprovada
> com ressalva".
>
> Validado por: ______________________  Data: ____ / ____ / ______

## 1. O que o jogo guarda (CA-20.2)

O MathGol **não pede e não guarda** nome de verdade, e-mail, telefone,
escola, turma, data de nascimento, foto nem qualquer texto livre digitado
pela criança. Não existe campo de texto livre no jogo: o apelido é montado
escolhendo um personagem e um animal de listas fixas.

| Onde | O que fica guardado |
|---|---|
| `jogadores/{uid}` | apelido montado de lista, avatar (nome de um arquivo do próprio jogo), Cruzeiros, itens comprados, fases, conquistas, borda, título, número da camisa |
| `jogadores/{uid}/resultados/{id}` | resultado de cada partida: fase, nível, gols, pontos, tempo e o resumo das cobranças |
| `apelidos/{uid}` | o mesmo apelido, em coleção separada |
| `salas/{codigo}` | nome da turma (digitado pelo professor), nível e tipos de conta |
| `salas/{codigo}/alunos/{uid}` | apelido, avatar e desempenho na aula |
| `partidas/{codigo}` e `/jogadores/{uid}` | as contas combinadas e o placar do duelo online |
| Navegador da criança (`localStorage`) | progresso, carteira, perfil, preferências de acessibilidade |
| Navegador do professor (`localStorage`) | **o nome real do aluno, se o professor anotar.** Nunca sai desse aparelho |

A identidade é o `uid` anônimo do Firebase Authentication. O "código do
craque" é uma credencial sorteada, sem nenhum dado pessoal dentro.

**Nome real:** a única parte do sistema que pode conter o nome de uma
criança é a chamada do professor, e ela fica apenas no navegador dele, em
`localStorage`. Nunca é enviada ao Firebase, não entra nos backups da nuvem
e some com o botão "Apagar os nomes desta sala deste aparelho".

## 2. Prazos de retenção (CA-20.1, CA-20.5)

| Dado | Prazo | Como é apagado |
|---|---|---|
| Perfil e histórico do jogador (`jogadores/*`, `apelidos/*`) | **12 meses** sem acesso | TTL do Firestore sobre `ultimoAcessoEm` |
| Sala de aula (`salas/*` e os alunos dela) | **30 dias** após a criação | TTL do Firestore sobre `expiraEm` |
| Duelo online (`partidas/*`) | **24 horas** após a criação | TTL do Firestore sobre `expiraEm` |
| Dados no navegador da criança | até ela apagar ou limpar o navegador | botão "Apagar meus dados" |
| Nome real anotado pelo professor | até ele apagar | botão "Apagar os nomes desta sala" |

O raciocínio de cada prazo:

- **12 meses** acompanha o ano letivo. Quem jogou no ano passado e voltou
  não perde o progresso; quem nunca mais voltou não fica guardado para
  sempre. O campo `ultimoAcessoEm` é atualizado a cada entrada, então o
  prazo conta a partir da última vez que a criança jogou, não da primeira.
- **30 dias** para a sala cobre com folga o uso dela, que é de uma aula.
- **24 horas** para o duelo online: a partida acaba em minutos.

## 3. Como ligar os prazos no Firebase (CA-20.3)

Os campos já são gravados pelo jogo. Falta criar as políticas de TTL no
Console, uma vez:

1. Console do Firebase → **Firestore Database → Time-to-live (TTL)**.
2. Criar política: coleção `salas`, campo `expiraEm`.
3. Criar política: coleção `partidas`, campo `expiraEm`.
4. Criar política: coleção `jogadores`, campo `ultimoAcessoEm`, e
   configurar o prazo de 12 meses.

> O TTL do Firestore apaga o documento, **não** as subcoleções dele. Os
> documentos em `salas/{codigo}/alunos` e `partidas/{codigo}/jogadores`
> precisam de uma limpeza própria: uma rotina agendada (Cloud Scheduler +
> Admin SDK) ou uma limpeza manual periódica pela equipe. Enquanto essa
> rotina não existir, o item fica em aberto nesta política.

## 4. Pedido de exclusão (CA-20.4)

Três caminhos, do mais simples ao último recurso:

1. **A própria criança:** menu → cartão do craque → "Apagar meus dados".
   Apaga o que está no aparelho e o documento na nuvem.
2. **O professor:** "Apagar os nomes desta sala deste aparelho", para a
   chamada que ele anotou.
3. **Responsável legal:** pedido à equipe HexaTech pelo canal publicado na
   tela de Créditos. A equipe apaga pelo Console ou pelo Admin SDK e
   responde confirmando. Prazo de atendimento: **15 dias**.

Como não há nome nem e-mail guardado, o pedido precisa vir acompanhado do
código do craque, que é o que identifica o registro.

## 5. Consentimento do responsável (CA-20.7)

**Conclusão da equipe:** o art. 14, §1º da LGPD exige consentimento
específico e destacado de um dos pais ou do responsável legal para o
tratamento de dados pessoais de crianças.

O MathGol trata apenas um identificador anônimo gerado pelo próprio
Firebase e dados de jogo (apelido de lista, pontuação, fases). Não há nome,
contato, localização nem qualquer dado que identifique a criança fora do
jogo. Por isso a equipe entende que **não se configura o cenário do art. 14
que exige o consentimento formal**, e que o aviso em linguagem simples
dentro do jogo (CA-20.6) atende ao §6º do mesmo artigo, que pede
informação clara sobre o tratamento.

Duas ressalvas que a equipe registra:

- Se em algum momento o jogo passar a pedir nome real, e-mail, turma ou
  qualquer dado de contato, esta conclusão **deixa de valer** e o
  consentimento formal passa a ser necessário.
- O nome real anotado pelo professor é dado pessoal de criança. Ele não sai
  do aparelho dele, mas o uso em sala deve seguir a política de dados da
  própria escola.

Esta conclusão é da equipe de desenvolvimento e **não substitui parecer
jurídico**. Para uso em rede pública de ensino, recomenda-se validação com
o setor responsável da escola ou da secretaria.

## 6. Quando revisar

A cada mudança que acrescente um campo novo ao Firestore, ou a cada seis
meses, o que vier primeiro.
