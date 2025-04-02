# @version ^0.4.1
# @author Rafael Abuawad <rafael.abuawad@live.com>

# @dev Imports the IERC721 interface
from ethereum.ercs import IERC721

# @dev Event for when a ballot is created
event BallotCreated:
    id: bytes32
    tableNumber: uint32
    locationId: uint8
    validVotes: uint32
    nullVotes: uint32
    blankVotes: uint32
    partyNames: DynArray[String[32], 8]
    partyVotes: DynArray[String[32], 8]
    createdAt: uint32

# Struct for a ballot
struct Ballot:
    tableNumber: uint32
    locationId: uint8
    validVotes: uint32
    nullVotes: uint32
    blankVotes: uint32
    partyNames: DynArray[String[32], 8]
    partyVotes: DynArray[String[32], 8]
    createdAt: uint256

# Storage variables
ballots: public(HashMap[uint256, Ballot])

# @dev Mapping from NFT ID to the address that owns it.
idToOwner: HashMap[uint256, address]

# @dev Token ID counter
totalSupply: public(uint256)

# @dev Mapping from owner address to count of his tokens.
ownerToNFTokenCount: HashMap[address, uint256]

# @dev Address of minter, who can mint a token
minter: address

# @dev Mapping from token ID to token URI
tokenUris: HashMap[uint256, String[256]]

# @dev Name of the smartcontract
NAME: constant(String[12]) = "Yo Custodio"

# @dev Symbol of the smartcontract
SYMBOL: constant(String[8]) = "YC-2025"


@deploy
@payable
def __init__():
    """
    @dev Contract constructor.
    """
    self.minter = msg.sender


@view
@external
def name() -> String[12]:
    return NAME


@view
@external
def symbol() -> String[8]:
    return SYMBOL


@view
@external
def balanceOf(_owner: address) -> uint256:
    """
    @dev Returns the number of NFTs owned by `_owner`.
         Throws if `_owner` is the zero address. NFTs assigned to the zero address are considered invalid.
    @param _owner Address for whom to query the balance.
    """
    assert _owner != empty(address)
    return self.ownerToNFTokenCount[_owner]


@view
@external
def ownerOf(_tokenId: uint256) -> address:
    """
    @dev Returns the address of the owner of the NFT.
         Throws if `_tokenId` is not a valid NFT.
    @param _tokenId The identifier for an NFT.
    """
    owner: address = self.idToOwner[_tokenId]
    # Throws if `_tokenId` is not a valid NFT
    assert owner != empty(address)
    return owner


@internal
def _addTokenTo(_tokenId: uint256, _to: address, _tokenURI: String[256]):
    """
    @dev Add a NFT to a given address
         Throws if `_tokenId` is owned by someone.
    """
    self.idToOwner[_tokenId] = _to
    self.tokenUris[_tokenId] = _tokenURI
    self.ownerToNFTokenCount[_to] += 1

    log IERC721.Transfer(sender=empty(address), receiver=_to, token_id=_tokenId)


@external
def mint(
    _to: address,
    _tokenURI: String[256],
    _tableNumber: uint32,
    _locationId: uint8,
    _validVotes: uint32,
    _nullVotes: uint32,
    _blankVotes: uint32,
    _partyNames: DynArray[String[32], 8],
    _partyVotes: DynArray[String[32], 8],
) -> bool:
    """
    @dev Function to mint tokens
         Throws if `msg.sender` is not the minter.
         Throws if `_to` is zero address.
         Throws if `_tokenId` is owned by someone.
    @param _to The address that will receive the minted tokens.
    @param _tokenURI The URI of the token.
    @param _tableNumber The table number of the ballot.
    @param _locationId The location id of the ballot.
    @param _validVotes The number of valid votes for the ballot.
    @param _nullVotes The number of null votes for the ballot.
    @param _blankVotes The number of blank votes for the ballot.
    @param _partyNames The names of the parties for the ballot.
    @param _partyVotes The votes for the parties for the ballot.
    @return A boolean that indicates if the operation was successful.
    """
    assert msg.sender == self.minter
    assert _to != empty(address)

    tokenId: uint256 = self.totalSupply
    assert self.idToOwner[tokenId] == empty(address)
    self.totalSupply += 1

    self._addTokenTo(tokenId, _to, _tokenURI)
    self._createBallot(tokenId, _tableNumber, _locationId, _validVotes, _nullVotes, _blankVotes, _partyNames, _partyVotes)
    return True


@view
@external
def tokenURI(tokenId: uint256) -> String[256]:
    return self.tokenUris[tokenId]


@internal
def _createBallot(
    _tokenId: uint256,
    _tableNumber: uint32,
    _locationId: uint8,
    _validVotes: uint32,
    _nullVotes: uint32,
    _blankVotes: uint32,
    _partyNames: DynArray[String[32], 8],
    _partyVotes: DynArray[String[32], 8],
) -> bool:
    assert self.ballots[_tokenId].createdAt == 0, "Ballot already exists"

    self.ballots[_tokenId] = Ballot(
        tableNumber=_tableNumber,
        locationId=_locationId,
        validVotes=_validVotes,
        nullVotes=_nullVotes,
        blankVotes=_blankVotes,
        partyNames=_partyNames,
        partyVotes=_partyVotes,
        createdAt=block.timestamp,
    )

    return True
